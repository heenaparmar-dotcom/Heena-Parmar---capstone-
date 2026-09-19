const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const mcp = require("../mcp/tavilyClient");
const { fillOnly, submitFilledForm, detectPlatform } = require("../skills/formFiller");
const { isPaidEvent } = require("../utils/detectPaidEvent");

const router = express.Router();

// Short-lived, in-memory (not DB) store of previewed-but-not-yet-submitted
// fills — this is a transient workflow step, not durable application data,
// so it's fine if a server restart clears it. Keyed by reviewId, scoped to
// the user who requested it so one user can't submit another's preview.
const pendingReviews = new Map();

// POST /api/form-review/preview — { url }. Opens the real form, fills what
// it confidently can, and ALWAYS stops before submitting — the human
// reviews the actual filled screenshot and explicit field list, then must
// press Submit themselves to trigger the real submission.
router.post("/preview", async (req, res) => {
  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required." });
  }

  const platform = detectPlatform(url);
  if (platform === "unknown") {
    return res.status(400).json({ error: "Only Google Forms and Luma links are supported right now." });
  }

  const applicantDetails = db.getApplicantDetails(req.user.id);
  if (!applicantDetails) {
    return res.status(400).json({ error: "No applicant details on file. Complete onboarding/Settings first." });
  }

  let warning = null;
  try {
    const pageText = await mcp.extractPage(url);
    if (isPaidEvent(pageText)) {
      warning = "This looks like a paid event. The agent never fills payment details — only registration fields shown below were attempted.";
    }
  } catch (err) {
    console.log(`[form-review] paid-event check skipped (page fetch failed): ${err.message}`);
  }

  try {
    const result = await fillOnly(url, { ...applicantDetails, email: req.user.email });
    if (!result.ok) {
      return res.status(422).json({ error: result.reason || "Could not fill any fields on this form." });
    }

    const reviewId = crypto.randomUUID();
    pendingReviews.set(reviewId, { userId: req.user.id, url, platform: result.platform, filled: result.filled });
    console.log(`[form-review] preview ${reviewId} — ${result.filled.length} filled, ${result.skipped.length} skipped`);

    res.json({
      reviewId,
      platform: result.platform,
      filled: result.filled,
      skipped: result.skipped,
      screenshot: result.screenshot,
      warning,
    });
  } catch (err) {
    console.error("[form-review] preview ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/form-review/:id/submit — re-fills with the EXACT reviewed
// values (no new Groq calls) and clicks the real submit button. Only ever
// runs on explicit user action.
router.post("/:id/submit", async (req, res) => {
  const review = pendingReviews.get(req.params.id);
  if (!review || review.userId !== req.user.id) {
    return res.status(404).json({ error: "Review not found or expired. Preview the form again." });
  }

  const applicantDetails = db.getApplicantDetails(req.user.id);
  try {
    const result = await submitFilledForm(review.url, { ...applicantDetails, email: req.user.email }, review.filled);
    pendingReviews.delete(req.params.id);

    const fields = {};
    for (const f of review.filled) fields[f.label] = { value: f.value, source: f.source };
    db.createApplication(req.user.id, { name: review.url, url: review.url }, fields, "applied", "Submitted via manual review.");

    res.json({ submitted: true, platform: result.platform });
  } catch (err) {
    console.error("[form-review] submit ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
