# Build Log

## Commit 1 — Define project plan and MVP scope

- **Date:** 11 September 2026
- **Time spent:** ~1 an half hour 
- **Rough tokens used:** ~3,000 tokens
- **What shipped:**
  - Defined the capstone problem around difficulty discovering design trends, events, workshops, communities, competitions, and industry updates.
  - Defined the Discord-based solution as the MVP instead of building a standalone app.
  - Created `plan.md` with the project overview and proposed solution.
  - Clearly separated the MVP scope from the final goals.
  - Defined the AI-Involvement Level as Level 2 — AI-Assisted Development.
  - Documented why this level of AI involvement was chosen.
  - Added development approach and MVP success criteria.

## Commit 2 — Opportunity Verification & Structuring Skill

- **Date:** 17 September 2026
- **Time spent:** ~45 minutes
- **Rough tokens used:** ~15,000 tokens
- **What shipped:**
  - Created `.claude/skills/opportunity-verification/SKILL.md`, scoped to verifying and structuring exactly ONE design opportunity at a time (never discovery, never multi-opportunity, never registration/application).
  - Defined the fixed output record (Title, Category, Organizer, Target audience, Date, Deadline, Location, Eligibility, Registration URL, Source URL, Relevance, Verification status, Missing/unverified information, Reason for relevance).

## Commit 3 (in progress) — Design World UI prototype + Assessment 2 agent backend

- **Date:** 18 September 2026
- **Time spent:** ~4–5 hours across several sessions
- **Rough tokens used:** ~180,000 tokens (rough estimate across the UI build, MCP research/testing, and the agent backend build)
- **What shipped:**
  - Built the full static Design World prototype (`index.html`, `style.css`, `script.js`, `data.js`): onboarding (intro → interests → geography), a visual-first Discover feed, Design Trends cards (designer/location/category), opportunity cards and details with per-field Verified/Unverified/Not found rendering, Calendar, Saved, and an "Ask Design World" entry point.
  - Root `.gitignore` and `.env.example` added so secrets stay out of Git regardless of where a `.env` lives.
  - Initialized `package.json` and a minimal Node backend (`server/`) implementing the **Design World Opportunity Research Agent**:
    - `gemini.js` — Gemini reasoning layer (`@google/genai`, model `gemini-flash-latest`), structured JSON output for request interpretation and candidate selection.
    - `mcp.js` — real MCP client (`@modelcontextprotocol/sdk`) calling a locally-spawned **Tavily MCP** server (`tavily-search`, `tavily-extract` tools) — a genuine MCP tool call, not a REST wrapper.
    - `skill-adapter.js` — runtime adapter that reads the actual `SKILL.md` file at runtime and sends its real instructions to Gemini as the verification step's system prompt, rather than reimplementing the Skill's judgment from scratch.
    - `agent.js` — the orchestrator: a genuine perceive → reason → act (MCP) → observe → reason → act (MCP) → observe → act (Skill) → observe → structure loop, emitting real status events at each step (no fake timers).
    - `server.js` — Express server serving the existing static frontend plus `POST /api/research` + `GET /api/research/:id/events` (SSE) for live status, and `GET /api/health` for debug/proof without exposing secrets.
  - Wired the frontend's "Ask Design World" flow to call this real backend and render live SSE events into the agent activity panel, replacing the earlier honest-but-static placeholder.
- **What failed on the first try, and what changed:**
  - The first MCP candidate tried for web search was `mcp-duckduckgo`, a no-signup community package — inspection showed its `postinstall` script silently downloads and executes an unverified prebuilt binary from GitHub. Rejected outright as a supply-chain risk before it was ever wired into the project.
  - The second candidate, `duckduckgo-mcp-server` (pure TypeScript, transparent source), installed cleanly, but a live smoke-test call to its search tool was rejected by DuckDuckGo's anti-bot protection ("DDG detected an anomaly..."). Since the assessment needs a demo that reliably works when recorded, this was swapped for **Tavily MCP**, an official, actively-maintained package using a free-tier API key — tested and confirmed reliable before being adopted.




  18th September --- starting fresh