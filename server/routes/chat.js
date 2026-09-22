const express = require("express");
const db = require("../db");
const { runTalkToMe } = require("../agent/talkToMeAgent");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(db.getChatState(req.user.id));
});

router.post("/message", async (req, res) => {
  const message = req.body?.message;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required." });
  }

  const { context, messages } = db.getChatState(req.user.id);

  try {
    const result = await runTalkToMe(context, messages, message);
    const updatedMessages = [
      ...messages,
      { role: "user", text: message, at: new Date().toISOString() },
      { role: "agent", text: result.reply, at: new Date().toISOString() },
    ].slice(-40);

    db.saveChatState(req.user.id, { context: result.context, messages: updatedMessages });

    res.json({
      reply: result.reply,
      steps: result.steps,
      intent: result.intent,
      results: result.results,
      context: result.context,
    });
  } catch (err) {
    console.error("[chat] ERROR:", err.message);
    const groqDown = /GroqUnavailableError|rate limit|overload/i.test(err.message);
    res.status(groqDown ? 503 : 500).json({
      error: groqDown
        ? "Something went wrong while reaching the Design World agent (rate limit/overload). Try again shortly."
        : err.message,
    });
  }
});

module.exports = router;
