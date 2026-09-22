const mcp = require("../mcp/tavilyClient");
const groq = require("../services/groq");
const { parseTavilyResults } = require("../utils/parseTavilyResults");

// Real hard location filter — generalized from the Assessment-2 agent's
// Pune-only isPuneCandidate. Rejects any candidate whose text names a
// different well-known city, or says "online"/"virtual", and requires the
// target location to actually appear. Not left to model judgment.
const OTHER_MAJOR_CITIES = [
  "pune", "mumbai", "bengaluru", "bangalore", "delhi", "new delhi", "hyderabad",
  "chennai", "kolkata", "ahmedabad", "gurgaon", "gurugram", "noida", "nashik",
  "nagpur", "jaipur", "surat", "indore", "chandigarh", "kochi", "coimbatore",
];

function matchesLocation(candidate, location) {
  if (!location) return true;
  const haystack = `${candidate.name} ${candidate.snippet}`.toLowerCase();
  const target = location.toLowerCase();

  if (/\bonline\b|\bvirtual\b/.test(haystack)) return false;
  if (!haystack.includes(target)) return false;

  const otherCities = OTHER_MAJOR_CITIES.filter((c) => c !== target && !target.includes(c));
  const mentionsOtherCity = otherCities.some((c) => new RegExp(`\\b${c}\\b`).test(haystack));
  return !mentionsOtherCity;
}

// The real "Talk to Me" agent loop: PERCEIVE (merge message into context,
// classify intent — the one genuine judgment call) -> ACT (real MCP search,
// only for workshops/trends/discover intents) -> OBSERVE+FILTER (real hard
// location filter for workshops) -> CROSS-CHECK (Groq relevance ranking) ->
// SHORTLIST. Every entry in `steps` reflects something that actually ran.
async function runTalkToMe(existingContext, existingMessages, userMessage) {
  const steps = [];

  steps.push("Understanding your request");
  const { intent, context, searchQuery } = await groq.updateChatContext(existingContext, existingMessages, userMessage);
  console.log(`[talk-to-me] intent=${intent} context=${JSON.stringify(context)}`);

  if (intent === "chat") {
    const reply = await groq.chatReply(context, existingMessages, userMessage, null);
    return { intent, context, reply, steps, results: null };
  }

  if (intent === "workshops") {
    steps.push("Searching real sources");
    console.log(`[talk-to-me] MCP CALL tavily_search — "${searchQuery}"`);
    const raw = await mcp.searchWeb(searchQuery || userMessage, 8);
    const candidates = parseTavilyResults(raw);
    console.log(`[talk-to-me] Parsed ${candidates.length} raw candidate(s)`);

    steps.push(context.location ? `Filtering for ${context.location}` : "Reviewing results");
    const filtered = context.location ? candidates.filter((c) => matchesLocation(c, context.location)) : candidates;
    console.log(`[talk-to-me] ${filtered.length}/${candidates.length} survived the location filter`);

    if (filtered.length === 0) {
      const reply = context.location
        ? `I searched real sources but couldn't find anything actually in ${context.location} matching that. Want me to broaden the search?`
        : "I searched real sources but couldn't find a confident match. Could you give me a bit more detail?";
      return { intent, context, reply, steps, results: [] };
    }

    steps.push("Checking relevance");
    let ranked;
    try {
      ranked = await groq.rankEvents(filtered, context);
    } catch (err) {
      if (!(err instanceof groq.GroqUnavailableError)) throw err;
      ranked = filtered.slice(0, 10).map((c) => ({ ...c, whyMatched: "" }));
    }

    steps.push("Preparing results");
    const reply = await groq.chatReply(context, existingMessages, userMessage, { resultCount: ranked.length, results: ranked });
    return { intent, context, reply, steps, results: ranked };
  }

  if (intent === "trends" || intent === "discover") {
    steps.push("Searching real sources");
    const query =
      searchQuery ||
      (intent === "trends" ? "emerging graphic design and UX design trends 2026" : "notable graphic designers and design projects 2026");
    const raw = intent === "discover" ? await mcp.searchWithImages(query, 8) : await mcp.searchWeb(query, 8);
    console.log(`[talk-to-me] MCP RESULT — ${raw.length} chars returned`);

    steps.push("Structuring results");
    let items;
    try {
      items = intent === "trends" ? await groq.extractTrends(raw) : await groq.extractDiscoverItems(raw);
    } catch (err) {
      if (!(err instanceof groq.GroqUnavailableError)) throw err;
      const reply = "I found real sources but Groq couldn't structure them right now (rate limit/overload). Try again shortly.";
      return { intent, context, reply, steps, results: [] };
    }

    steps.push("Preparing results");
    const reply = await groq.chatReply(context, existingMessages, userMessage, { resultCount: items.length, items });
    return { intent, context, reply, steps, results: items };
  }

  throw new Error(`Unknown intent from Groq: ${intent}`);
}

module.exports = { runTalkToMe, matchesLocation };
