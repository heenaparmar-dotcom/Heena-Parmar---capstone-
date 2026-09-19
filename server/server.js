require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");

const workshopsRouter = require("./routes/workshops");
const trendsRouter = require("./routes/trends");
const mcp = require("./mcp/tavilyClient");

const SKILL_PATHS = [
  path.join(__dirname, "..", ".claude", "skills", "workshop-application-preparation", "SKILL.md"),
  path.join(__dirname, "..", ".claude", "skills", "opportunity-verification", "SKILL.md"),
];

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the static Design World frontend from the repo root — same origin
// as the API, so the frontend can just fetch('/api/...').
app.use(express.static(path.join(__dirname, "..")));

app.use("/api/workshops", workshopsRouter);
app.use("/api/trends", trendsRouter);

// Debug/health endpoint — confirms configuration and the real MCP tool
// names without ever exposing key values.
app.get("/api/health", async (req, res) => {
  const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY);
  const health = {
    // The three fields asked for, exactly:
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    mcpConfigured: tavilyConfigured,
    skillConfigured: SKILL_PATHS.every((p) => fs.existsSync(p)),
    // Extra diagnostics — never a key value, just real connection status.
    mcpTools: null,
    mcpError: null,
  };

  if (tavilyConfigured) {
    try {
      health.mcpTools = await mcp.listTools();
    } catch (err) {
      health.mcpError = err.message;
    }
  }

  res.json(health);
});

app.listen(PORT, () => {
  console.log(`Design World server running at http://localhost:${PORT}`);
  console.log(
    `  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "present" : "MISSING"} | ` +
      `TAVILY_API_KEY: ${process.env.TAVILY_API_KEY ? "present" : "MISSING"}`
  );
});
