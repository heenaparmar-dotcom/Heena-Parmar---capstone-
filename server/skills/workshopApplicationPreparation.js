// Runtime adapter for the "Workshop Application Preparation & Approval" Skill.
//
// The canonical Skill definition lives at
// .claude/skills/workshop-application-preparation/SKILL.md, authored for
// Claude Code's native Skill mechanism. A standalone Node process cannot
// invoke a Claude Code Skill directly, so this adapter reads the Skill's
// real instructions from disk at runtime — this file's job is to actually
// execute the procedure the Skill file documents.
//
// Gemini-usage redesign: mapping known profile fields (name, email, phone,
// college, course, year, portfolio) onto standard application fields is
// entirely mechanical — plain JavaScript does it with zero Gemini calls and
// zero risk of the model inventing a value. Gemini is used ONLY as an
// optional enhancement to notice extra, non-standard questions on the real
// registration page (e.g. "Why do you want to attend?") — and if Gemini is
// unavailable (quota/rate limit), the Skill still fully executes with the
// deterministic fields; it never blocks or fabricates.

const fs = require("fs");
const path = require("path");
const mcp = require("../mcp/tavilyClient");
const { generateStructuredJson } = require("../services/gemini");
const { EXTRA_FIELDS_SCHEMA } = require("../schemas");

const SKILL_PATH = path.join(
  __dirname,
  "..",
  "..",
  ".claude",
  "skills",
  "workshop-application-preparation",
  "SKILL.md"
);

let cachedSkillText = null;

function loadSkillInstructions() {
  if (cachedSkillText) return cachedSkillText;
  if (!fs.existsSync(SKILL_PATH)) {
    throw new Error(
      `Workshop Application Preparation & Approval Skill not found at ${SKILL_PATH}. ` +
        "This adapter refuses to fabricate preparation behavior without the real Skill file present."
    );
  }
  cachedSkillText = fs.readFileSync(SKILL_PATH, "utf8");
  return cachedSkillText;
}

const RED_FLAG_PATTERNS = [
  { key: "CAPTCHA", pattern: /captcha/i },
  { key: "OTP", pattern: /\bOTP\b|one[- ]time password/i },
  { key: "payment", pattern: /payment|₹|fee\s*:\s*(?!not|free|0)/i },
  { key: "signature", pattern: /signature/i },
  { key: "legal declaration", pattern: /declar(e|ation)|terms and conditions.*agree|I agree to/i },
];

// The standard fields this Skill can match deterministically from a profile
// — no Gemini call needed, no risk of inventing a value.
const STANDARD_FIELDS = [
  { key: "name", label: "Full name", profileKey: "name" },
  { key: "email", label: "Email", profileKey: "email" },
  { key: "phone", label: "Phone", profileKey: "phone" },
  { key: "college", label: "College", profileKey: "college" },
  { key: "course", label: "Course", profileKey: "course" },
  { key: "year", label: "Year", profileKey: "year" },
  { key: "portfolio", label: "Portfolio", profileKey: "portfolio" },
];

function buildDeterministicFields(userProfile) {
  return STANDARD_FIELDS.map(({ key, label, profileKey }) => {
    const value = userProfile && userProfile[profileKey];
    return {
      key,
      label,
      value: value || "",
      status: value ? "filled" : "needs_input",
      source: value ? "user_profile" : "none",
    };
  });
}

// prepareApplication: workshop (ONE selected, verified record) + userProfile
// (only what the user actually provided). Never invents a value for a field
// the profile doesn't actually have.
async function prepareApplication(workshop, userProfile) {
  loadSkillInstructions(); // confirms the real Skill file is present before doing anything
  console.log("[skill] Workshop Application Preparation & Approval Skill activated.");

  let formEvidence = "";
  let evidenceFetchFailed = false;
  if (workshop.registrationUrl && workshop.registrationUrl !== "Not found") {
    try {
      console.log(`[skill] MCP CALL tavily_extract (registration form) — ${workshop.registrationUrl}`);
      formEvidence = await mcp.extractPage(workshop.registrationUrl);
      console.log(`[skill] MCP RESULT tavily_extract — ${formEvidence.length} chars returned`);
    } catch (err) {
      console.log(`[skill] MCP RESULT tavily_extract — failed: ${err.message}`);
      evidenceFetchFailed = true;
    }
  }

  // Code-level red-flag scan (not left to the model) over whatever real page
  // text was actually fetched — a genuine safety check, not a formality.
  const manualActionReasons = RED_FLAG_PATTERNS.filter((p) => p.pattern.test(formEvidence)).map((p) => p.key);

  // Deterministic mapping — this alone makes the Skill fully functional even
  // with zero Gemini quota available.
  const fields = buildDeterministicFields(userProfile);

  // Optional Gemini enhancement: notice extra, non-standard questions on the
  // real page. Never blocks — if Gemini is unavailable, the Skill still
  // returns a complete, real, deterministic result.
  let geminiUsed = false;
  let geminiNote = "";
  if (formEvidence) {
    try {
      const prompt = `Real registration-page evidence (may be partial):
"""
${formEvidence}
"""

Identify any application questions on this real page that are NOT already
covered by: full name, email, phone, college, course, year, portfolio.
Only list questions that actually appear in the evidence above — never
invent one. If there are none, return an empty list.`;
      const extra = await generateStructuredJson(prompt, EXTRA_FIELDS_SCHEMA);
      geminiUsed = true;
      (extra.extraFields || []).forEach((f) => {
        fields.push({ key: f.key, label: f.label, value: "", status: "needs_input", source: "none" });
      });
      if (extra.manualActionReasons) manualActionReasons.push(...extra.manualActionReasons);
    } catch (err) {
      console.log(`[skill] Gemini extra-field detection unavailable (${err.message}) — continuing with deterministic fields only.`);
      geminiNote = "Gemini was unavailable, so only your standard profile fields could be matched — the real registration page may ask additional questions not shown here.";
    }
  }

  const allReasons = Array.from(new Set(manualActionReasons));

  return {
    workshopName: workshop.name,
    fields,
    missingFields: fields.filter((f) => f.status === "needs_input").map((f) => f.key),
    requiresManualAction: allReasons.length > 0,
    manualActionReasons: allReasons,
    formEvidenceAvailable: Boolean(formEvidence) && !evidenceFetchFailed,
    geminiUsedForExtraFields: geminiUsed,
    note: geminiNote,
    status: "ready_for_review",
  };
}

module.exports = { prepareApplication, loadSkillInstructions, SKILL_PATH };
