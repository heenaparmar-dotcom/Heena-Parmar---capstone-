const express = require("express");
const mcp = require("../mcp/tavilyClient");
const groq = require("../services/groq");
const { parseTavilyResults } = require("../utils/parseTavilyResults");

const router = express.Router();

// GET /api/trends — real MCP search for current design trends/designers
// worldwide, then Groq extracts only what the source text actually states
// (designer name, city, country). Never fabricates attribution; unknown
// fields are null. No static/demo data is ever returned from here.
router.get("/", async (req, res) => {
  try {
    console.log("[trends] MCP CALL tavily_search — design trends around the world");
    const raw = await mcp.searchWeb("emerging graphic design and UX design trends 2026 designers", 8);
    const candidates = parseTavilyResults(raw);
    console.log(`[trends] Parsed ${candidates.length} raw candidate(s)`);

    if (candidates.length === 0) {
      return res.json({ trends: [], status: "no_results" });
    }

    const sourceText = candidates.map((c) => `Title: ${c.name}\nURL: ${c.url}\nContent: ${c.snippet}`).join("\n\n");

    let trends;
    try {
      trends = await groq.extractTrends(sourceText);
    } catch (err) {
      if (err instanceof groq.GroqUnavailableError) {
        return res.status(503).json({
          error: "The real search succeeded, but Groq couldn't structure the results right now (rate limit/overload). Try again shortly.",
        });
      }
      throw err;
    }

    res.json({ trends, status: "success" });
  } catch (err) {
    console.error("[trends] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
