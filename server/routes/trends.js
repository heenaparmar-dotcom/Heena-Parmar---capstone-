const express = require("express");
const mcp = require("../mcp/tavilyClient");
const gemini = require("../services/gemini");

const router = express.Router();

// GET /api/trends — real design-trend discovery: a real MCP search (with
// Tavily's own image results) + Gemini structuring. No static/demo data is
// ever returned from here; if the real call fails, the frontend falls back
// to its own clearly-labeled demo content rather than this endpoint faking
// a result.
router.get("/", async (req, res) => {
  try {
    console.log("[trends] MCP CALL tavily_search (with images) — design trends");
    const raw = await mcp.searchWithImages("emerging graphic design and UX design trends 2026", 6);
    console.log(`[trends] MCP RESULT — ${raw.length} chars returned`);

    if (!raw || !raw.trim()) {
      return res.json({ trends: [], status: "no_results" });
    }

    const trends = await gemini.extractTrends(raw);
    console.log(`[trends] Structured ${trends.length} trend item(s)`);
    res.json({
      trends: trends.map((t) => ({ ...t, imageUrl: t.imageUrl || null })),
      status: "success",
    });
  } catch (err) {
    console.error("[trends] ERROR:", err.message);
    const message = /GEMINI/i.test(err.message)
      ? "AI processing failed. Please try again."
      : /MCP|TAVILY/i.test(err.message)
      ? "Search source unavailable. Please try again."
      : err.message;
    res.status(500).json({ error: message });
  }
});

module.exports = router;
