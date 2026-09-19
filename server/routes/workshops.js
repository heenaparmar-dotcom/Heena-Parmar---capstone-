const express = require("express");
const crypto = require("crypto");

const { runWorkshopSearch, GeminiUnavailableError } = require("../agent/workshopResearchAgent");
const { prepareApplication } = require("../skills/workshopApplicationPreparation");
const { buildWorkshopIcs, isConfirmedDate, isConfirmedTime } = require("../utils/ics");

const router = express.Router();

// In-memory job store — a student-project-appropriate amount of
// infrastructure for a single local demo, no database needed.
const jobs = new Map();

function createJob() {
  const id = crypto.randomUUID();
  const job = { id, events: [], listeners: new Set(), done: false };
  jobs.set(id, job);
  return job;
}

function emitToJob(job, event) {
  job.events.push(event);
  for (const listener of job.listeners) listener(event);
}

function safeMessage(err) {
  if (/api[_-]?key/i.test(err.message)) return "A configuration problem occurred.";
  return err.message;
}

// POST /api/workshops/search — kicks off the real agent run, returns a job id.
router.post("/search", (req, res) => {
  const query = req.body && req.body.query;
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "A non-empty 'query' string is required." });
  }

  const job = createJob();
  res.status(202).json({ id: job.id });

  runWorkshopSearch(query.trim(), (event) => emitToJob(job, event))
    .then((outcome) => {
      job.done = true;
      if (outcome.status === "no_results") {
        emitToJob(job, {
          type: "result",
          status: "no_results",
          workshops: [],
          message: "No verified Pune workshops were found for this request.",
        });
      } else {
        emitToJob(job, { type: "result", status: "success", workshops: outcome.workshops });
      }
    })
    .catch((err) => {
      console.error("[agent] AGENT ERROR:", err.message);
      job.done = true;
      const isMcp = /MCP|TAVILY/i.test(err.message);
      const isGeminiQuota = err instanceof GeminiUnavailableError || /RESOURCE_EXHAUSTED|429/.test(err.message);
      const message = isMcp
        ? "Search source unavailable. Please try again."
        : isGeminiQuota
        ? "Gemini is temporarily unavailable (quota/rate limit) right now. The real search and Pune filtering worked — only the AI verification step is blocked. Try again once the quota resets."
        : /GEMINI/i.test(err.message)
        ? "AI processing failed. Please try again."
        : safeMessage(err);
      emitToJob(job, { type: "error", message, geminiAvailable: !isGeminiQuota });
    });
});

// GET /api/workshops/search/:id/events — SSE stream of real agent events.
router.get("/search/:id/events", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();

  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();

  const write = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  job.events.forEach(write);

  if (job.done) {
    res.end();
    return;
  }

  const listener = (event) => {
    write(event);
    if (event.type === "result" || event.type === "error") res.end();
  };
  job.listeners.add(listener);
  req.on("close", () => job.listeners.delete(listener));
});

// POST /api/workshops/application/prepare — invokes the Skill adapter for
// exactly ONE selected workshop.
router.post("/application/prepare", async (req, res) => {
  const { workshop, userProfile } = req.body || {};
  if (!workshop || typeof workshop !== "object" || !workshop.name) {
    return res.status(400).json({ error: "A 'workshop' record is required." });
  }

  try {
    console.log(`[skill] SKILL START workshop-application-preparation — ${workshop.name}`);
    const application = await prepareApplication(workshop, userProfile || {});
    console.log(`[skill] SKILL RESULT — requiresManualAction: ${application.requiresManualAction}, missing: ${application.missingFields.length}`);
    res.json({ application, status: "ready_for_review" });
  } catch (err) {
    console.error("[skill] SKILL ERROR:", err.message);
    const message = /GEMINI/i.test(err.message) ? "AI processing failed. Please try again." : safeMessage(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/workshops/application/submit — only reachable after the user has
// explicitly approved. Since this prototype has no real, safe browser-
// automation path into an arbitrary third-party form, submission here means
// "the user has approved; hand off the registration link for them to
// complete manually" — never a fabricated "submitted" confirmation.
router.post("/application/submit", (req, res) => {
  const { workshop, approved } = req.body || {};
  if (!approved) {
    return res.status(400).json({ error: "Submission requires explicit approval." });
  }
  if (!workshop || !workshop.registrationUrl || workshop.registrationUrl === "Not found") {
    return res.status(400).json({ error: "No registration URL is available for this workshop." });
  }

  res.json({
    status: "approved_pending_manual_submission",
    message:
      "Your application was approved. Automated submission to external sites isn't implemented in this prototype — please complete registration at the link below.",
    registrationUrl: workshop.registrationUrl,
  });
});

// POST /api/workshops/calendar/block — the user has approved ONE workshop
// and confirmed (or the agent already confirmed) a real date + start/end
// time. Returns a real .ics file for the user to import into their own
// calendar app — this route refuses to fabricate a time slot that wasn't
// actually confirmed.
router.post("/calendar/block", (req, res) => {
  const { workshop } = req.body || {};
  if (!workshop || !workshop.name) {
    return res.status(400).json({ error: "A 'workshop' record is required." });
  }
  if (!isConfirmedDate(workshop.date)) {
    return res.status(400).json({ error: "This workshop's date isn't confirmed yet. Please confirm a date before blocking calendar time." });
  }
  if (!isConfirmedTime(workshop.startTime) || !isConfirmedTime(workshop.endTime)) {
    return res.status(400).json({ error: "Start and end time must both be confirmed (HH:MM) before blocking calendar time." });
  }

  try {
    const ics = buildWorkshopIcs(workshop);
    console.log(`[calendar] Blocked ${workshop.date} ${workshop.startTime}-${workshop.endTime} for "${workshop.name}"`);
    res.json({
      status: "blocked",
      ics,
      filename: `${workshop.name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.ics`,
      confirmed: {
        date: workshop.date,
        dayOfWeek: workshop.dayOfWeek,
        startTime: workshop.startTime,
        endTime: workshop.endTime,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
