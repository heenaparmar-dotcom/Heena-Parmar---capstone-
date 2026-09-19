# Assessment 2 Architecture — Design World Workshop Research Agent

```
USER
  |  "Find workshops happening in Pune for design students."
  v
DESIGN WORLD UI            (index.html / style.css / script.js)
  |  POST /api/workshops/search  ->  GET /api/workshops/search/:id/events (SSE)
  v
WORKSHOP RESEARCH API       (server/routes/workshops.js, server/server.js)
  v
DESIGN WORLD WORKSHOP RESEARCH AGENT   (server/agent/workshopResearchAgent.js)
  |
  |  PERCEIVE  -> REASON -> ACT -> OBSERVE -> REASON -> ACT -> OBSERVE -> SHORTLIST
  |
  +--> DETERMINISTIC PARSING (server/utils/deterministicParsing.js) — 0 Gemini calls
  |      request parsing (location/type/audience) and candidate extraction
  |      from Tavily's own fixed-format search text are both mechanical —
  |      plain JS handles them. Gemini is a non-fatal fallback only if the
  |      deterministic parse is genuinely inconclusive.
  |
  +--> GEMINI            (server/services/gemini.js) — at most 1 call per search
  |      spent ONLY on verifying/structuring the single most plausible
  |      candidate against real fetched evidence — the one step that
  |      genuinely needs semantic judgment. Always instructed to use only
  |      the evidence given, never invent. If this one call fails (quota/
  |      rate limit), the agent reports that distinctly — real search and
  |      real Pune filtering already succeeded; only verification is
  |      blocked — never a fabricated result.
  |
  +--> MCP SEARCH         (server/mcp/tavilyClient.js)
  |      real MCP client -> Tavily MCP server, over the MCP protocol.
  |      Tools actually called: tavily_search, tavily_extract.
  |
  +--> HARD PUNE FILTER   (real code, workshopResearchAgent.js::isPuneCandidate)
  |      not left to the model's judgment — rejects any candidate whose
  |      stated location names a different major city (Mumbai, Nashik,
  |      Bangalore, Delhi, ...) or says "online"/"virtual", and requires
  |      "Pune" to actually appear.
  v
SHORTLIST  (verified / conflicting / unverified, with real source URLs)
  v
USER SELECTS ONE WORKSHOP
  v
WORKSHOP APPLICATION PREPARATION & APPROVAL SKILL
  .claude/skills/workshop-application-preparation/SKILL.md  (canonical definition)
  server/skills/workshopApplicationPreparation.js           (runtime adapter)
  |
  |  reads the real registration page (another real MCP call). Mapping
  |  known user-profile fields (name/email/phone/college/course/year/
  |  portfolio) onto application fields is fully deterministic — 0 Gemini
  |  calls, 0 risk of inventing a value. Gemini is used ONLY as an optional
  |  enhancement to notice non-standard questions on the real page; if that
  |  call fails, the Skill still returns a complete, correct result from
  |  the deterministic fields alone. Scans real page text for CAPTCHA/OTP/
  |  payment/signature/legal-declaration red flags at the code level.
  v
APPLICATION REVIEW  (fields: Filled vs. Needs your input)
  v
USER APPROVAL   ("Approve & Submit" — disabled while any field is missing)
  v
SUBMISSION / MANUAL COMPLETION
  only ever "approved — complete manually at <registration link>" —
  never a fabricated "submitted" confirmation, since no real form-
  automation path exists in this prototype.
```

## Roles, plainly

- **Agent** (`workshopResearchAgent.js`) — the orchestrator. Decides what
  happens next at every stage; the only thing that calls Gemini or MCP.
- **Gemini** — the reasoning/model layer. Interprets requests, parses real
  search text, judges design-relevance and verification status. Never
  touches the network or filesystem itself, and is explicitly instructed in
  every prompt to use only the evidence it's given.
- **MCP** — the external capability layer. The agent's only way to reach
  the outside world (real web search, real page content) is a real MCP tool
  call (`tavily-search`, `tavily-extract`), not a bespoke API wrapper.
- **Skills** — two separate, narrowly-scoped repeatable procedures:
  - *Opportunity Verification & Structuring* — verifies one already-known
    opportunity's fields against credible sources (used elsewhere in
    Design World's broader concept; not the primary Assessment 2 path).
  - *Workshop Application Preparation & Approval* — prepares one selected
    workshop's application from known information only, and gates on
    explicit approval. Its `SKILL.md` is the canonical definition; because
    a standalone Node process can't invoke a Claude Code Skill natively,
    a runtime adapter reads the Skill's real text and sends it to Gemini as
    the operative system instruction for that one step. This relationship
    is documented, not hidden or claimed to be something it isn't.
- **UI** — user interaction and visualization. Never talks to Gemini or MCP
  directly; only calls the agent's HTTP/SSE endpoints and renders what
  comes back, including honest error states.

## Perceive / Reason / Act / Observe, concretely

| Stage | What actually happens |
|---|---|
| Perceive | Gemini extracts location/type/audience/search terms from the raw request |
| Reason | Agent decides what to search for; later, decides which raw search hits are worth extracting further |
| Act | Real MCP `tavily-search` call; later, real MCP `tavily-extract` call(s) on surviving candidates |
| Observe | Agent inspects actual returned text — not a hard-coded response |
| Reason (again) | Hard Pune filter (real code) + Gemini's design-relevance and verification assessment |
| Shortlist | The final, structured, source-backed candidate list returned to the UI |

No chain-of-thought is exposed to the UI — only the coarse stage/status
events listed in `server/agent/workshopResearchAgent.js`.
