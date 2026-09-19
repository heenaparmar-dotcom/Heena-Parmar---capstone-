# Design World

Design World is a visual discovery platform for design students — trends,
designers, workshops, competitions, events, communities, and opportunities
in one place.

## Assessment 2 workflow

The graded workflow is workshop discovery in Pune:

```
User: "Find workshops happening in Pune for design students."
  -> Design World Workshop Research Agent
  -> Gemini (reasoning) + a real MCP web-search tool
  -> a hard Pune filter and a design-relevance check (real code, not a guess)
  -> a shortlist of verified/labeled candidates
  -> user selects one
  -> Workshop Application Preparation & Approval skill
  -> application review (known fields filled, unknowns marked "needs your input")
  -> explicit user approval
  -> submission only as "approved — complete manually," never a fabricated confirmation
```

See `ASSESSMENT_2_ARCHITECTURE.md` for the full diagram and role breakdown.

## Architecture at a glance

- **Agent** (`server/agent/workshopResearchAgent.js`) — orchestrates the loop.
- **Gemini** (`server/services/gemini.js`) — the reasoning/model layer.
- **MCP** (`server/mcp/tavilyClient.js`) — the external capability layer (real Tavily MCP tool calls).
- **Skills** (`.claude/skills/*/SKILL.md` + `server/skills/*.js` adapters) — the two narrowly-scoped repeatable procedures (opportunity verification; workshop application preparation).
- **UI** (`index.html`, `style.css`, `script.js`, `data.js`) — user interaction and visualization only; it never calls Gemini or MCP directly, only the agent's HTTP/SSE endpoints.

## Environment variables

Copy `.env.example` to `.env` (already gitignored) and fill in:

- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
- `GEMINI_MODEL` — optional, defaults to `gemini-flash-latest`
- `TAVILY_API_KEY` — from [tavily.com](https://www.tavily.com), free tier, no card required. Without this, the agent runs and fails honestly at the search step rather than fabricating results.
- `PORT` — optional, defaults to `3000`

Never commit `.env`. Never put a key in frontend code.

## Running locally

```
npm install
npm start
```

Then open **http://localhost:3000** (the server serves the frontend and the API on the same origin).

## Testing

1. `npm start`, open the app.
2. Click **Ask Design World**, use the suggested prompt "Find workshops happening in Pune for design students."
3. Watch the real agent activity panel — each step reflects an actual backend event.
4. Without `TAVILY_API_KEY` set, expect an honest failure at the search step (no fabricated workshops).
5. With both keys set, expect a real shortlist, each with source URLs and a verification status.
6. Select a workshop → **Prepare application** → review the fields (Filled vs. Needs your input) → **Approve & Submit** is disabled until every field is resolved, and never auto-submits.

## Known limitations (be honest about these)

- No real browser automation/form submission — the app never claims a form was submitted; "Approve & Submit" hands off a registration link for the user to complete manually.
- No real image sourcing — workshop cards show a labeled placeholder, never a stock photo presented as the real venue.
- Discover and the "More to explore" events are static prototype content, clearly labeled — only the Pune workshop results from "Ask Design World" are real, agent-produced data.
- Claude Code Skills cannot be invoked natively from a standalone Node process. Each Skill's `SKILL.md` is the canonical definition; a runtime adapter reads its real text and sends it to Gemini as the operative instructions for that one step — this is documented explicitly, not hidden.

## Safety / approval behavior

The Workshop Application Preparation & Approval skill never invents a field
value, never bypasses CAPTCHA/OTP/payment/signature/legal declarations (a
code-level scan over real fetched page text flags these, not just the
model's say-so), and never submits without an explicit "Approve & Submit"
click — which is disabled while any required field still needs input.
