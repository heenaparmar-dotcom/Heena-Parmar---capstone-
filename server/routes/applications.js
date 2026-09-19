const express = require("express");
const mcp = require("../mcp/tavilyClient");
const groq = require("../services/groq");
const db = require("../db");
const { extractFormLabels } = require("../utils/extractFormLabels");
const { blockCalendarForEvent } = require("../services/googleCalendar");
const { attemptAutoFill, detectPlatform } = require("../skills/formFiller");
const { isPaidEvent } = require("../utils/detectPaidEvent");
const { sendApplicationConfirmation } = require("../services/gmail");

const router = express.Router();

const STANDARD_LABEL_MAP = {
  name: "fullName",
  phone: "phone",
  mobile: "phone",
  college: "college",
  university: "college",
  institute: "college",
  course: "course",
  branch: "course",
  year: "year",
  portfolio: "portfolioUrl",
  linkedin: "portfolioUrl",
};

// POST /api/applications/apply — { events: [event, ...] }. Runs the agent
// flow per selected event: PERCEIVE (event + applicant details) -> ACT
// (fetch real registration page) -> REASON (Groq maps known fields, drafts
// answers only for genuinely unmatched free-text questions) -> RECORD.
// Never invents structured fields (phone/email/portfolio); only ever
// generates content for free-text questions, and that generated content is
// returned to the caller clearly flagged so the UI can show it before
// anything is considered final.
router.post("/apply", async (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: "events array is required." });
  }

  const applicantDetails = db.getApplicantDetails(req.user.id);
  if (!applicantDetails) {
    return res.status(400).json({ error: "No applicant details on file. Complete onboarding first." });
  }

  const results = [];
  for (const event of events) {
    try {
      results.push(await applyToOneEvent(req.user, event, applicantDetails));
    } catch (err) {
      console.error(`[applications] ERROR applying to "${event.name}":`, err.message);
      results.push({ event, status: "error", error: err.message });
    }
  }
  res.json({ results });
});

async function applyToOneEvent(user, event, applicantDetails) {
  console.log(`[agent] PERCEIVE — preparing application for "${event.name}"`);

  if (event.announcementOnly) {
    console.log(`[agent] "${event.name}" is a social-media announcement, not a registration page — skipping auto-apply.`);
    const note = "This is a social-media announcement, not a registration page. No form to fill automatically.";
    const application = db.createApplication(user.id, event, {}, "needs_manual_action", note);
    return {
      applicationId: application.id,
      event,
      fields: {},
      agentGenerated: [],
      status: "needs_manual_action",
      note,
      calendarEventId: null,
      calendarError: null,
    };
  }

  let pageText = "";
  if (event.url) {
    console.log(`[agent] ACT — MCP extractPage ${event.url}`);
    pageText = await mcp.extractPage(event.url);
  }

  if (isPaidEvent(pageText)) {
    console.log(`[agent] "${event.name}" looks like a paid event — routing to manual completion, no auto-apply.`);
    const note = "This looks like a paid event. The agent never handles payment — complete registration manually.";
    const application = db.createApplication(user.id, event, {}, "needs_manual_action", note);
    return {
      applicationId: application.id,
      event,
      fields: {},
      agentGenerated: [],
      status: "needs_manual_action",
      note: "This looks like a paid event. The agent never handles payment — complete registration manually.",
      calendarEventId: null,
      calendarError: null,
    };
  }

  const platform = detectPlatform(event.url);
  if (platform !== "unknown") {
    return applyViaFormFiller(user, event, applicantDetails, platform);
  }

  const labels = extractFormLabels(pageText);
  console.log(`[agent] OBSERVE — extracted ${labels.length} candidate form label(s)`);

  const fields = {};
  const agentGenerated = [];
  const fieldLabels = labels.filter((l) => l.type === "field").map((l) => l.text);
  const questionLabels = labels.filter((l) => l.type === "question").map((l) => l.text);

  if (fieldLabels.length > 0) {
    try {
      const mappings = await groq.mapApplicationFields(fieldLabels, applicantDetails);
      for (const m of mappings) {
        fields[m.label] = { value: m.value, source: "applicant_details" };
      }
    } catch (err) {
      if (!(err instanceof groq.GroqUnavailableError)) throw err;
      console.log("[agent] Groq field-mapping unavailable — falling back to keyword matching only.");
      fallbackKeywordMap(fieldLabels, applicantDetails, fields);
    }
  }
  // Unmatched structured fields (e.g. "Portfolio link:") are left for the
  // user — never invented, only free-text questions get an agent-drafted
  // answer.
  for (const label of fieldLabels) {
    if (!fields[label]) fields[label] = { value: null, source: "needs_input" };
  }

  for (const question of questionLabels.slice(0, 5)) {
    try {
      const answer = await groq.draftFreeTextAnswer(question, applicantDetails);
      fields[question] = { value: answer, source: "agent_generated" };
      agentGenerated.push(question);
    } catch (err) {
      if (!(err instanceof groq.GroqUnavailableError)) throw err;
      fields[question] = { value: null, source: "needs_input" };
    }
  }

  // This page is neither Google Forms nor Luma, so there is no real
  // automated submission path for it — only Google Forms/Luma get driven
  // by a real browser and actually submitted (see applyViaFormFiller).
  // Marking this "applied" would be a fabricated success: nothing was
  // actually sent to the site. Always needs_manual_action here; the
  // detected fields are shown only as a reference to copy from.
  const hasReliableFields = labels.length > 0;
  const note = hasReliableFields
    ? "This site isn't one the agent can auto-submit to yet (only Google Forms and Luma are supported). Fields below are detected for reference — complete registration manually."
    : "Could not reliably detect application form fields on this page automatically. Ready for manual completion.";
  console.log(`[agent] REASON — ${Object.keys(fields).length} field(s) detected for reference — no real submission path, manual action required`);

  const application = db.createApplication(user.id, event, fields, "needs_manual_action", note);
  return {
    applicationId: application.id,
    event,
    fields: hasReliableFields ? fields : {},
    agentGenerated,
    status: "needs_manual_action",
    note,
    calendarEventId: null,
    calendarError: null,
  };
}

// Real browser automation path (Google Forms / Luma) — opens the actual
// registration page in headless Chromium, fills only confidently-resolved
// fields, and auto-submits ONLY when every discovered field was filled
// with no guesses left outstanding. Otherwise stops before submission and
// reports exactly what's missing — never a fabricated "submitted" state.
async function applyViaFormFiller(user, event, applicantDetails, platform) {
  console.log(`[agent] ACT — automating ${platform} form at ${event.url}`);
  const result = await attemptAutoFill(event.url, { ...applicantDetails, email: user.email });

  const fields = {};
  for (const f of result.filled || []) fields[f.label] = { value: f.value, source: f.source };
  for (const s of result.skipped || []) fields[s.label] = { value: null, source: "needs_input" };
  const agentGenerated = (result.filled || []).filter((f) => f.source === "agent_generated").map((f) => f.label);

  const status = result.submitted ? "applied" : "needs_manual_action";
  const noteText = result.reason || result.note || null;
  const application = db.createApplication(user.id, event, fields, status, noteText);

  let calendarEventId = null;
  let calendarError = null;
  if (result.submitted) {
    try {
      calendarEventId = await blockCalendarForEvent(user, event);
      db.updateApplicationStatus(application.id, "applied", { calendarEventId });
      console.log(`[agent] ACT — real Calendar event created: ${calendarEventId}`);
    } catch (err) {
      calendarError = err.message;
      console.log(`[agent] Calendar block skipped: ${err.message}`);
    }

    try {
      await sendApplicationConfirmation(user, event);
      console.log(`[agent] Confirmation email sent to ${user.email}`);
    } catch (err) {
      console.log(`[agent] Confirmation email failed (non-fatal): ${err.message}`);
    }
  }

  return {
    applicationId: application.id,
    event,
    fields,
    agentGenerated,
    status,
    note: result.reason || result.note || (result.submitted ? `Auto-submitted via ${platform}.` : undefined),
    calendarEventId,
    calendarError,
  };
}

function fallbackKeywordMap(labels, applicantDetails, fields) {
  for (const label of labels) {
    const lower = label.toLowerCase();
    for (const [keyword, detailKey] of Object.entries(STANDARD_LABEL_MAP)) {
      if (lower.includes(keyword) && applicantDetails[detailKey]) {
        fields[label] = { value: applicantDetails[detailKey], source: "applicant_details" };
        break;
      }
    }
  }
}

router.get("/", (req, res) => {
  res.json({ applications: db.listApplicationsForUser(req.user.id) });
});

module.exports = router;
