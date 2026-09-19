const express = require("express");
const db = require("../db");
const groq = require("../services/groq");

const router = express.Router();

router.get("/", (req, res) => {
  const details = db.getApplicantDetails(req.user.id);
  res.json({ profileNotes: details?.extra?.profileNotes || "" });
});

// POST /api/talktome/message — { message }. Extracts durable facts from
// what the user shares and merges them into their stored profile notes
// (applicant_details.extra.profileNotes), which downstream application-
// filling (Google Forms/Luma auto-fill, free-text question drafting) reads
// as extra context — never inventing beyond what the user actually said.
router.post("/message", async (req, res) => {
  const message = req.body?.message;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required." });
  }

  const details = db.getApplicantDetails(req.user.id) || {};
  const existingNotes = details.extra?.profileNotes || "";

  try {
    const { reply, updatedNotes } = await groq.updateProfileFromChat(existingNotes, message);
    db.saveApplicantDetails(req.user.id, {
      fullName: details.fullName,
      phone: details.phone,
      college: details.college,
      course: details.course,
      year: details.year,
      portfolioUrl: details.portfolioUrl,
      extra: { ...details.extra, profileNotes: updatedNotes },
    });
    res.json({ reply, profileNotes: updatedNotes });
  } catch (err) {
    if (err instanceof groq.GroqUnavailableError) {
      return res.status(503).json({ error: "Groq is temporarily unavailable (rate limit/overload). Try again shortly." });
    }
    console.error("[talktome] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
