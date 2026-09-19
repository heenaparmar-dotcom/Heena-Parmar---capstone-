// MCP tool-connection layer for the Design World Workshop Research Agent.
//
// This is the ONLY module that talks to an MCP server. It spawns the
// installed `tavily-mcp` package as a local stdio MCP server (the standard
// way to run it) and calls its real tools over the MCP protocol via the
// official @modelcontextprotocol/sdk client. This is a genuine MCP call —
// not a plain REST request to Tavily's own API.
//
// Requires TAVILY_API_KEY in the process environment. Without it, every
// function here throws a clear, honest error rather than pretending to
// have called anything.

const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const TAVILY_ENTRY = path.join(__dirname, "..", "..", "node_modules", "tavily-mcp", "build", "index.js");

let clientPromise = null;

function connect() {
  if (clientPromise) return clientPromise;

  if (!process.env.TAVILY_API_KEY) {
    return Promise.reject(
      new Error(
        "TAVILY_API_KEY is not set. Add it to a root .env file (see .env.example) before running the agent."
      )
    );
  }

  clientPromise = (async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [TAVILY_ENTRY],
      env: { ...process.env },
    });
    const client = new Client({ name: "design-world-workshop-agent", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    return client;
  })();

  clientPromise.catch(() => {
    clientPromise = null; // allow retry on next call if connection failed
  });

  return clientPromise;
}

// Lists the real tools this MCP server exposes — used by /api/health so the
// actual tool names can be confirmed without ever exposing the key.
async function listTools() {
  const client = await connect();
  const { tools } = await client.listTools();
  return tools.map((t) => t.name);
}

async function callTool(name, args) {
  const client = await connect();
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const message = result.content?.map((c) => c.text).join(" ") || "MCP tool call failed.";
    throw new Error(`MCP tool "${name}" failed: ${message}`);
  }
  return result.content?.map((c) => c.text).join("\n") || "";
}

// ACT: real web search via the tavily_search tool.
// (Confirmed against this installed version's actual tool list via
// /api/health — earlier hyphenated names were an unverified assumption.)
function searchWeb(query, maxResults = 6) {
  return callTool("tavily_search", { query, max_results: maxResults });
}

// ACT (further calls): fetch real page content for a candidate's URL — used
// both for workshop verification and for reading a real registration form.
// includeImages uses tavily_extract's real `include_images` option (confirmed
// against the actual tool schema) to pull real images off that specific
// page — e.g. its og:image/poster — into the returned text as markdown
// image syntax. No separate image-search integration, no invented URLs.
function extractPage(url, includeImages = false) {
  return callTool("tavily_extract", { urls: [url], include_images: includeImages });
}

// ACT (trends): real web search with Tavily's own image results included —
// confirmed live against the actual tool schema (include_image_descriptions)
// before using it. Real image URLs + descriptions come back from Tavily
// itself, not a separate image-search integration or scraped og:image.
function searchWithImages(query, maxResults = 6) {
  return callTool("tavily_search", { query, max_results: maxResults, include_image_descriptions: true });
}

module.exports = { listTools, searchWeb, extractPage, searchWithImages };
