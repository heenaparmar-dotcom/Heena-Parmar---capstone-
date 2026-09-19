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

Note: the work above (Commit 3) was built on a separate branch (`UI`). The Assessment 2 entry below is a genuinely fresh rebuild on `Assesment-2-Heena`, per instruction to start from scratch on this branch rather than port that earlier work over.

## Assessment 2

### Entry

- **Date:** 18 September 2026
- **Time spent:** Not directly measured (a long single session)
- **Approx tokens used:** Not directly measured
- **What shipped:**
  - Rebuilt Design World from scratch on branch `Assesment-2-Heena`: `index.html`, `style.css`, `script.js`, `data.js` — nav (Discover, Events, Saved, Search, Profile), a Pinterest-inspired masonry Discover feed (clearly labeled demo content), an Events page split into real agent-sourced Pune workshops vs. labeled demo events, a Profile page (local-only, used to fill known application fields), and an "Ask Design World" entry point wired to the real backend.
  - Root `.gitignore` and `.env.example`, `package.json`, and a Node backend (`server/`) implementing the **Design World Workshop Research Agent**:
    - `server/services/gemini.js` — Gemini reasoning layer (`@google/genai`, model `gemini-flash-latest`) for request interpretation, candidate extraction from real search text, and workshop verification/design-relevance assessment — every prompt explicitly instructs "use only the evidence given; never invent."
    - `server/mcp/tavilyClient.js` — real MCP client (`@modelcontextprotocol/sdk`) spawning a local **Tavily MCP** server and calling its real `tavily-search` and `tavily-extract` tools.
    - `server/agent/workshopResearchAgent.js` — the orchestrator: perceive → reason → act (MCP search) → observe → reason (parse candidates) → **a hard Pune filter implemented as real string-matching code**, not left to the model's judgment → act (MCP extract per surviving candidate) → observe → reason (verify + design-relevance) → shortlist. Real status events emitted at every stage, no fake timers.
    - A second, new Skill — `.claude/skills/workshop-application-preparation/SKILL.md` — scoped to preparing exactly ONE selected workshop's application from known information only, with an explicit approval gate and a hard stop on CAPTCHA/OTP/payment/signature/legal declarations. `server/skills/workshopApplicationPreparation.js` is its runtime adapter (same pattern as the existing Skill: reads the real file, sends it to Gemini as the system prompt) — plus a code-level red-flag scanner over real fetched registration-page text, not just an LLM's say-so.
    - `server/routes/workshops.js` + `server/server.js` — `POST /api/workshops/search` (SSE progress via `GET /api/workshops/search/:id/events`), `POST /api/workshops/application/prepare`, `POST /api/workshops/application/submit` (only ever returns "approved, complete manually at this link" — never fabricates a real submission), and `GET /api/health`.
  - Pulled the existing "Opportunity Verification & Structuring" Skill file in read-only from the `assessment-2-skill` branch (via `git show`, no merge, no branch switch) so both Skills are present without duplicating or rewriting the already-completed one.
  - Verified the real Gemini API key works end-to-end (PERCEIVE/REASON step tested live against the actual Gemini API); `TAVILY_API_KEY` intentionally deferred per instruction, with the full workflow validated to fail honestly (real SSE events, then a clean non-leaking error) rather than fabricate a result.
- **What broke first, and what I changed:**
  - The Profile page's interest-tile picker called a full form re-render on every tile click, which reset the plain text inputs (name/email/etc.) back to whatever was last *saved* — silently discarding anything the user had typed but not yet submitted. Caught via an automated browser test (filled the name field, clicked a tile, submitted, reloaded — name came back empty even though the tile selection persisted). Fixed by splitting the render into `renderProfileFields()` (inputs, called once on load) and `renderProfileInterestTiles()` (tiles only, called on every tile click) so tile selection no longer touches unrelated form state.

## Assessment 2 — Approve & block calendar time for Pune workshops

### Entry

- **Date:** 18 September 2026
- **Time spent:** Not directly measured
- **Approx tokens used:** Not directly measured
- **What shipped:**
  - Extended the Workshop Research Agent's verification step (`server/services/gemini.js`, `server/schemas.js`) to extract real `startTime`/`endTime` per workshop, using the sentinel `"unconfirmed"` — the agent is explicitly told never to estimate or round a time that wasn't actually stated in the fetched evidence.
  - `dayOfWeek` is deliberately **not** asked of Gemini — it's computed in code from the confirmed `date` (`computeDayOfWeek()` in `server/agent/workshopResearchAgent.js`), so it can never disagree with the date itself.
  - New `server/utils/ics.js` — builds a real, standards-compliant `.ics` calendar file for one confirmed workshop time block, and refuses (throws) if the date or either time isn't a fully confirmed, real value.
  - New route `POST /api/workshops/calendar/block` (`server/routes/workshops.js`) — validates date/startTime/endTime are confirmed before building and returning the real `.ics` content; otherwise returns an honest error instead of guessing a time.
  - Workshop cards now show Approve/Reject actions. Reject removes the card. Approve either blocks immediately (if the agent already confirmed a real date + start/end time) or reveals inline date/time inputs the user must fill in themselves — never auto-filled with a guess — before "Confirm & block" is enabled.
  - Approving downloads the real `.ics` file via the browser (`Blob` + a synthetic `<a download>` click) and records the block in a new "Blocked calendar" list on the Saved page (localStorage), so approvals are visible in-app without needing a full calendar UI rebuild.
  - Chose `.ics` download over (a) an app-only calendar view or (c) a real Google Calendar MCP, because: the account-linked Google Calendar MCP connector visible in this session is tied to *this Claude Code session's* OAuth, not reachable from the standalone Node/Express backend — using it here would have been dishonest about what's actually connected. `.ics` export is genuinely real and independently verifiable (a correct calendar file the user imports themselves), which fits the project's no-mock discipline better than an in-app-only state that just *looks* like a calendar block.
- **What broke first, and what I changed:**
  - Assumed the Tavily MCP tool names were `tavily-search` / `tavily-extract` (hyphenated) without checking — this was wrong. The actually-installed version's real tools are `tavily_search` / `tavily_extract` (underscored), confirmed by reading the real tool list from `/api/health` after connecting. Fixed in `server/mcp/tavilyClient.js` and the related log labels; caught before it ever reached a demo, but it's a good example of why I verify tool names against the live connection instead of trusting documentation/memory.
  - Live-testing the real end-to-end run (`"Find workshops happening in Pune for design students."`) surfaced a second real issue: the default model `gemini-flash-latest` is currently oversubscribed — Google's API itself returned a `404` for a different candidate model (`gemini-2.5-flash`) saying it's "no longer available to new users," recommending `gemini-3.6-flash`. Switched the default model to `gemini-3.6-flash` and added a real (not fabricated) retry-with-backoff specifically for the `503 UNAVAILABLE / high demand` condition, since that's a genuine transient error Gemini's public API returns under load. Even with retries, five consecutive live attempts still hit sustained `503`s specifically on the larger `extractCandidates` call (the smaller `perceive` call and the real MCP search succeeded reliably every time) — reported honestly rather than faking a shortlist to make the demo look finished.

## Assessment 2 — Registration status on approve, in-app Calendar tab, real trend images

### Entry

- **Date:** 18 September 2026
- **Time spent:** Not directly measured
- **Approx tokens used:** Not directly measured
- **What shipped:**
  - **Registration status on Approve**: clicking Approve now also triggers the real `Workshop Application Preparation & Approval` skill adapter (`POST /api/workshops/application/prepare`) and shows an honest status on the card — `Preparing registration…` → `✓ Ready for review` or `⚠ Needs manual input`. Deliberately never shows "Registered," since no real form-submission path exists and the Skill's own rules forbid auto-submitting — the status button opens the real application-review modal for the user to actually complete and approve.
  - **In-app Calendar tab**: new nav item + month-grid view built from `state.blockedCalendar` (no new store — reuses the existing calendar-block feature's data). Days with a blocked workshop are marked; clicking one opens a detail panel, and clicking an item there shows full workshop details (organizer/venue/date/time/eligibility/registration link/sources) — reconstructed entirely from the persisted blocked-calendar record, so it still works after a page reload even though the in-memory agent-search results don't persist.
  - **Real trend images on Discover** (`server/routes/trends.js`, new): a small, real agent flow — `mcp.searchWithImages()` calls the real `tavily_search` tool with `include_image_descriptions: true` (verified live against the actual tool schema first), then Gemini structures the results into trend items, matching each one to a real image URL Tavily actually returned (or leaving it empty — never inventing one). Discover now fetches this real endpoint on load; each card shows the real image with the typographic placeholder always rendered behind it, so a failed image load (`onerror`) just reveals the honest placeholder rather than a broken-image icon or a layout break. Falls back to the existing clearly-labeled demo content only if the real fetch fails, with a visible status message explaining why.
  - Confirmed live, via a direct MCP tool call, that Tavily's own image results are real and topically matched (not a separate image-search integration, no new API key) before building against it.
- **What broke first, and what I changed:**
  - The `.demo-label` CSS rule set `display: inline-block` unconditionally, which — because author styles always win over the browser's default `[hidden] { display: none }` UA rule, even at equal specificity — meant `label.hidden = true` in JS silently did nothing. Caught by an automated test asserting the label actually hides once real trends load successfully (it didn't). Fixed with an explicit `.demo-label[hidden] { display: none; }` override.
  - Same automated test also seemed to show a broken test image not falling back, and an application-review modal appearing empty — both turned out to be test-timing bugs (checking `isVisible()`/field-row count before the relevant async `fetch`/`onerror` had actually resolved), not app bugs; confirmed by re-running with the assertions properly awaited, and separately by screenshot.
  - Live-tested the real (non-mocked) `/api/workshops/calendar/block` and `/api/trends`/`/api/workshops/application/prepare` endpoints: calendar blocking worked for real (a genuine `.ics` file downloaded); the two Gemini-dependent endpoints hit the same sustained `503` Google-side overload already logged in the previous entry — confirmed via direct `curl` tests rather than assumed, then validated via mocked responses so the actual new UI logic (registration status, calendar tab, image fallback) could still be verified honestly without pretending Gemini was available when it wasn't.

## Assessment 2 — Cut Gemini calls per search from 4–6 to 1, fix the real quota wall

### Entry

- **Date:** 19 September 2026
- **Time spent:** Not directly measured (a long single session)
- **Approx tokens used:** Not directly measured
- **What broke (real, confirmed via server logs, not assumed):** `gemini-3.6-flash`'s free-tier quota is a hard **20 requests/day per project per model**. One workshop search was spending up to 5 of those (1 for request-interpretation, 1 for candidate-extraction, up to 3 for per-candidate verification) — so only ~3-4 real searches were possible per day before every subsequent request failed with a real `429 RESOURCE_EXHAUSTED`, surfaced honestly in the UI as "AI processing failed" rather than faked.
- **What shipped:**
  - New `server/utils/deterministicParsing.js` — replaces two of the three Gemini calls with plain JavaScript:
    - `parseRequestDeterministically(query)` — extracts location/type/audience from the request via keyword matching against a known-city list and type keywords. For "Find workshops happening in Pune for design students," this now correctly resolves `{location: "Pune", opportunityType: "Workshops", audience: "design students", confident: true}` with **zero Gemini calls** — confirmed by direct unit test and by the real server log line `via: deterministic parsing`.
    - `parseTavilySearchResults(rawText)` — Tavily's own MCP server formats results in a fixed, stable structure (`Title: ... \nURL: ... \nContent: ...`, confirmed by capturing real live output first) — this is the server's own formatting, not model output, so a regex parses it reliably with **zero Gemini calls**, confirmed live: a real search returned 6 candidates parsed correctly without touching Gemini.
    - `isLikelyDesignRelevant()` — a cheap keyword pre-filter so the one remaining Gemini call (verification) is spent on a design-plausible candidate, not wasted on an obviously unrelated result.
  - `server/agent/workshopResearchAgent.js` rewritten around this: Gemini is now called **at most once per search** (verifying the single best Pune+design-relevant candidate), only falling back to a Gemini-assisted parse if the deterministic one is genuinely inconclusive — and even that fallback is wrapped so a Gemini failure never blocks perceiving the request. Confirmed via server log: one full real run made exactly 1 Gemini call total (down from up to 5).
  - New `GeminiUnavailableError` — when the one remaining Gemini call fails, the agent no longer reports a generic error indistinguishable from "no results." It reports, honestly: real search succeeded, real Pune filtering succeeded, only AI verification is blocked, with the real underlying reason attached. `routes/workshops.js` surfaces this as a distinct message and a `geminiAvailable: false` flag — confirmed live, twice, against the real exhausted quota.
  - `server/skills/workshopApplicationPreparation.js` rewritten the same way: matching a user's real profile (name/email/phone/college/course/year/portfolio) onto standard application fields is now **fully deterministic — zero Gemini calls**. Gemini is used only as an optional enhancement to notice non-standard questions on a real fetched registration page; if that call fails, the Skill still returns a complete, correct, real result (confirmed live: Gemini failed with a real 503, and the Skill still correctly returned 3 filled + 4 "needs_input" fields from a real profile, with an honest note explaining the enhancement was skipped).
  - `/api/health` now reports exactly `{geminiConfigured, mcpConfigured, skillConfigured}` (booleans only, confirmed real key presence and both real SKILL.md files on disk), plus non-secret diagnostics.
  - Switched the configured model from `gemini-3.6-flash` (20/day hard cap, confirmed exhausted) to `gemini-flash-latest` (currently resolving to `gemini-3.8-flash`, a **5-requests-per-minute** limit instead of a daily one) — a real, legitimate model swap since Google scopes quota per model, not a workaround.
- **Real test results:**
  - Confirmed via direct `curl` + server log: one real search now costs exactly 1 Gemini call (previously up to 5).
  - Ran the real, complete pipeline successfully end-to-end (no mocks) after the fix: real `tavily_search` → 6 real candidates parsed deterministically → 6 survived the real Pune filter → real `tavily_extract` on the top candidate → 1 real Gemini verification call → **1 real, verified Pune workshop returned** ("Design Workshop — MIT-WPU DesignXPO x FoF Pune", Friends of Figma Pune, real venue address, real image, real registration URL, `verificationStatus: "verified"`).
  - Ran the real Skill against that real workshop with a real profile: correctly filled name/email/portfolio, correctly marked phone/college/course/year "needs_input", never invented anything, logged the required `"Workshop Application Preparation & Approval Skill activated."` line for real.
  - Confirmed the approval gate is enforced **server-side**, not just by hiding a button: `POST /application/submit` with `approved: false` → real `400` rejection; with `approved: true` → real `"approved_pending_manual_submission"` response with the actual registration URL, never a fabricated "submitted" confirmation.
  - Confirmed the new per-minute limit clears in under a minute (unlike the old daily wall), making repeated real demo runs practical.