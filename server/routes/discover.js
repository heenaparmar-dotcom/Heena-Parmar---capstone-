const express = require("express");
const mcp = require("../mcp/tavilyClient");
const groq = require("../services/groq");

const router = express.Router();

// GET /api/discover — real MCP image-search for notable designers/design
// projects, Groq-structured. Same honesty discipline as /api/trends: fields
// the source text doesn't actually state come back null, never guessed;
// imageUrl only set when Tavily actually returned an image for that item.
router.get("/", async (req, res) => {
  try {
    console.log("[discover] MCP CALL tavily_search (with images) — designers and design projects");
    const raw = await mcp.searchWithImages("notable graphic designers and design projects 2026", 8);
    console.log(`[discover] MCP RESULT — ${raw.length} chars returned`);

    if (!raw || !raw.trim()) {
      return res.json({ items: [], status: "no_results" });
    }

    let items;
    try {
      items = await groq.extractDiscoverItems(raw);
    } catch (err) {
      if (err instanceof groq.GroqUnavailableError) {
        return res.status(503).json({
          error: "The real search succeeded, but Groq couldn't structure the results right now (rate limit/overload). Try again shortly.",
        });
      }
      throw err;
    }

    res.json({ items, status: "success" });
  } catch (err) {
    console.error("[discover] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
