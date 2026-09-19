const express = require("express");
const mcp = require("../mcp/tavilyClient");
const groq = require("../services/groq");
const db = require("../db");
const { parseTavilyResults } = require("../utils/parseTavilyResults");

const router = express.Router();

// GET /api/events/recommended — real MCP search seeded from the user's
// stored preferences, then Groq ranks down to the top 10. Never returns a
// fabricated event; if preferences aren't set, tells the caller to onboard
// first rather than guessing.
router.get("/recommended", async (req, res) => {
  const prefs = db.getPreferences(req.user.id);
  if (!prefs || (prefs.locations.length === 0 && prefs.interests.length === 0)) {
    return res.status(400).json({ error: "No preferences set yet. Complete onboarding first." });
  }

  const query = [
    ...prefs.eventTypes,
    "for",
    ...prefs.interests,
    "students",
    "in",
    prefs.locations.join(" or "),
  ]
    .filter(Boolean)
    .join(" ");

  try {
    console.log(`[events] MCP CALL tavily_search — "${query}"`);
    const raw = await mcp.searchWeb(query, 10);
    const candidates = parseTavilyResults(raw);
    console.log(`[events] Parsed ${candidates.length} raw candidates`);

    if (candidates.length === 0) {
      return res.json({ events: [], status: "no_results" });
    }

    let ranked;
    try {
      ranked = await groq.rankEvents(candidates, prefs);
    } catch (err) {
      if (err instanceof groq.GroqUnavailableError) {
        return res.status(503).json({
          error: "The real search succeeded, but Groq couldn't rank the results right now (rate limit/overload). Try again shortly.",
          rawCandidateCount: candidates.length,
        });
      }
      throw err;
    }

    res.json({ events: ranked, status: "success" });
  } catch (err) {
    console.error("[events] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
