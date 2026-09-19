// Design World Workshop Research Agent — the orchestrator.
//
// Genuine multi-step loop: PERCEIVE -> REASON -> ACT (MCP search) -> OBSERVE
// -> REASON (parse candidates) -> hard Pune filter (real code) -> ACT (MCP
// extract) -> OBSERVE -> REASON (verify) -> SHORTLIST.
//
// Gemini-usage redesign: the previous version spent a Gemini call on every
// step (interpret request, parse candidates, verify — up to 5-6 calls per
// search against a 20/day free-tier quota). Request-parsing and
// candidate-extraction are both mechanical enough for plain code (see
// server/utils/deterministicParsing.js) — Gemini is now spent ONLY on
// verifying/structuring the 1-2 most plausible candidates, the one step
// that genuinely needs semantic judgment. Gemini failing at that one step
// no longer takes down the whole run silently — it's surfaced as a
// distinct, honest "Gemini temporarily unavailable" condition, never a
// fabricated result.

const gemini = require("../services/gemini");
const mcp = require("../mcp/tavilyClient");
const { emptyWorkshopRecord } = require("../schemas");
const { parseRequestDeterministically, parseTavilySearchResults, isLikelyDesignRelevant } = require("../utils/deterministicParsing");

const OTHER_MAHARASHTRA_CITIES = ["mumbai", "nashik", "nagpur", "pimpri-chinchwad", "thane", "aurangabad"];
const OTHER_MAJOR_CITIES = ["bangalore", "bengaluru", "delhi", "new delhi", "hyderabad", "chennai", "kolkata", "ahmedabad", "gurgaon", "gurugram", "noida"];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

class AgentError extends Error {}
class GeminiUnavailableError extends AgentError {}

function step(stage, status, message) {
  return { type: "agent_step", stage, status, message };
}

function computeDayOfWeek(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return "unconfirmed";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "unconfirmed";
  return DAY_NAMES[dt.getDay()];
}

// PUNE IS A HARD FILTER — real string matching, not left to model judgment.
function isPuneCandidate(candidate) {
  const haystack = `${candidate.location || ""} ${candidate.name || ""} ${candidate.snippet || ""}`.toLowerCase();
  const mentionsPune = haystack.includes("pune");
  const mentionsOtherCity = [...OTHER_MAHARASHTRA_CITIES, ...OTHER_MAJOR_CITIES].some((city) => haystack.includes(city));
  const locationSaysOnline = /\bonline\b|\bvirtual\b|\bwebinar\b/i.test(candidate.location || "");
  return mentionsPune && !mentionsOtherCity && !locationSaysOnline;
}

async function runWorkshopSearch(query, emit) {
  console.log(`[agent] AGENT START — query: ${JSON.stringify(query)}`);

  // ---- PERCEIVE (deterministic; Gemini only as a non-fatal fallback) --------
  emit(step("perceive", "in_progress", "Understanding your request"));
  let criteria = parseRequestDeterministically(query);
  let perceivedBy = "deterministic parsing";
  if (!criteria.confident) {
    try {
      const aiCriteria = await gemini.interpretRequest(query);
      criteria = { ...criteria, ...Object.fromEntries(Object.entries(aiCriteria).filter(([, v]) => v)), searchQuery: query };
      perceivedBy = "Gemini (deterministic parse was inconclusive)";
    } catch (err) {
      console.log(`[agent] Gemini fallback for request parsing unavailable (${err.message}) — using deterministic best-effort parse instead of failing.`);
    }
  }
  console.log(`[agent] Extracted location: ${criteria.location || "(none stated)"} | type: ${criteria.opportunityType || "(unspecified)"} | via: ${perceivedBy}`);
  emit(step("perceive", "completed", `Looking for ${criteria.opportunityType || "workshops"} in ${criteria.location || "your area"}`));

  // ---- ACT: real MCP search ---------------------------------------------------
  emit(step("act_search", "in_progress", "Searching real sources"));
  console.log(`[agent] MCP CALL tavily_search — "${criteria.searchQuery}"`);
  const rawResults = await mcp.searchWeb(criteria.searchQuery);
  console.log(`[agent] MCP RESULT tavily_search — ${rawResults.length} chars returned`);
  emit({ type: "mcp_call", tool: "tavily_search", status: "completed" });

  if (!rawResults || !rawResults.trim()) {
    emit(step("act_search", "completed", "No results returned"));
    return { workshops: [], status: "no_results" };
  }
  emit(step("act_search", "completed", "Received search results"));

  // ---- OBSERVE + REASON: parse candidates (deterministic — Tavily's own
  // fixed text formatting, not model-generated, so no Gemini needed here) ----
  emit(step("observe_candidates", "in_progress", "Reviewing workshop results"));
  const candidates = parseTavilySearchResults(rawResults);
  console.log(`[agent] Parsed ${candidates.length} raw candidates (deterministic parser, 0 Gemini calls)`);
  emit(step("observe_candidates", "completed", `Found ${candidates.length} candidate result(s)`));

  // ---- HARD FILTER: Pune only (real code) -------------------------------------
  emit(step("filter_pune", "in_progress", "Filtering for Pune"));
  const puneCandidates = candidates.filter(isPuneCandidate);
  console.log(`[agent] Filtering candidates for Pune — ${puneCandidates.length}/${candidates.length} survived`);
  emit(step("filter_pune", "completed", `${puneCandidates.length} candidate(s) actually located in Pune`));

  if (puneCandidates.length === 0) {
    return { workshops: [], status: "no_results" };
  }

  // Cheap deterministic design-relevance pre-filter, so the one Gemini call
  // this run makes isn't wasted verifying an obviously unrelated result.
  const designLikely = puneCandidates.filter(isLikelyDesignRelevant);
  const toVerify = (designLikely.length ? designLikely : puneCandidates).slice(0, 2);
  console.log(`[agent] ${toVerify.length} candidate(s) selected for Gemini verification (design-keyword pre-filter, real cost control)`);

  // ---- ACT + OBSERVE + REASON: verify (the one step that genuinely needs
  // semantic judgment, so it's the only one still spending Gemini calls) ----
  emit(step("verify", "in_progress", "Cross-checking workshop details"));
  const verified = [];
  let geminiFailed = false;
  let geminiFailureReason = "";

  for (const candidate of toVerify) {
    console.log(`[agent] Cross-checking candidate: ${candidate.url}`);
    let pageEvidence = "";
    try {
      console.log(`[agent] MCP CALL tavily_extract (with images) — ${candidate.url}`);
      pageEvidence = await mcp.extractPage(candidate.url, true);
      console.log(`[agent] MCP RESULT tavily_extract — ${pageEvidence.length} chars returned`);
    } catch (err) {
      console.log(`[agent] MCP RESULT tavily_extract — failed: ${err.message}`);
    }

    let result;
    try {
      result = await gemini.verifyWorkshop(candidate, pageEvidence);
    } catch (err) {
      console.log(`[agent] Gemini verification unavailable: ${err.message}`);
      geminiFailed = true;
      geminiFailureReason = err.message;
      break; // don't keep retrying against a real quota/outage — surface it honestly instead
    }

    if (!result.isDesignRelevant) {
      console.log(`[agent] Excluded (not design-relevant): ${candidate.name}`);
      continue;
    }

    const imageUrl = result.imageUrl && /^https?:\/\//.test(result.imageUrl) ? result.imageUrl : null;
    console.log(`[agent] Image for "${result.name}": ${imageUrl || "none found — placeholder will be shown"}`);

    verified.push({
      ...emptyWorkshopRecord(),
      ...result,
      location: "Pune",
      dayOfWeek: computeDayOfWeek(result.date),
      imageUrl,
      sourceUrls: [candidate.url],
      checkedAt: new Date().toISOString(),
    });
  }
  emit({ type: "mcp_call", tool: "tavily_extract", status: "completed" });
  emit(step("verify", "completed", `${verified.length} workshop(s) confirmed relevant to design students`));

  // Distinguish "genuinely no results" from "Gemini was unavailable" — never
  // silently present the second as the first.
  if (geminiFailed && verified.length === 0) {
    throw new GeminiUnavailableError(
      `GEMINI_UNAVAILABLE: the real search and Pune filtering succeeded (found ${puneCandidates.length} candidate(s) actually in Pune), but Gemini couldn't verify them right now (${geminiFailureReason}).`
    );
  }

  // ---- SHORTLIST ---------------------------------------------------------------
  emit(step("shortlist", "in_progress", "Shortlisting workshops"));
  emit(step("shortlist", "completed", verified.length ? "Shortlist ready" : "No verified workshops found"));
  console.log(`[agent] AGENT COMPLETE — ${verified.length} workshop(s) shortlisted`);

  return {
    workshops: verified,
    status: verified.length ? "success" : "no_results",
  };
}

module.exports = { runWorkshopSearch, isPuneCandidate, computeDayOfWeek, AgentError, GeminiUnavailableError };
