
Project Plan
Design Information & Notification Service (Discord MVP)
1. Problem

Core user problem: Design students don't have one reliable place to discover and stay on top of design trends, events, workshops, communities, and competitions. The information exists — it's just spread across Instagram, Behance, Dribbble, LinkedIn, newsletters, school noticeboards, and dozens of individual Discord/Slack communities. The result is missed deadlines (competition submissions, workshop registrations), inconsistent awareness of what's happening in the field, and time lost switching between apps just to feel "in the loop."

Target users:

Primary: design students at Indian design schools (UI/UX, graphic, product, communication design) — starting realistically with Flame's own design student community as the seed audience, since that's who you can recruit, observe, and iterate with directly.
Secondary: early-career/junior designers who still rely on informal discovery rather than institutional access to opportunities.

An assumption worth testing before you build anything: the stated problem is "information is scattered," but scattering isn't automatically the pain point — plenty of students already follow 15+ design accounts. The sharper pain point may actually be filtering and curation fatigue (too much noise, no way to tell what's relevant or credible) rather than lack of channels. Worth a quick gut-check with 5–10 classmates before you finalize scope: ask them to describe the last time they missed something design-related they wish they'd known about, and why. Their answer will tell you whether you're solving a "discovery" problem or a "trust/filtering" problem — the two lead to slightly different MVPs.

2. Proposed Solution

A curated, categorized Discord server that centralizes design trends, events, workshops, communities, competitions, and industry updates, and pushes timely updates to members who opt into the categories they care about.

The core value isn't aggregation (RSS readers already do that badly) — it's human curation + a channel students already check. Discord is the right medium specifically because it meets students where they already have communities (gaming, coding, college groups), rather than asking them to open one more app.

How it works at a glance: content is manually sourced and posted by you (the curator) into categorized channels; members self-select interest roles during onboarding; posts relevant to a role tag that role so people are only notified about what they opted into; a weekly digest channel recaps the week for anyone who doesn't want per-post notifications.

3. MVP Scope

Essential, and nothing more:

A single Discord server with a clear onboarding flow (rules, purpose, how to set interest roles).
A small set of content categories, each its own channel — trends, events & workshops, competitions & opportunities, communities & resources.
Self-selected interest roles (via Discord's built-in Channels & Roles onboarding, not a custom bot) so members get pinged only for what they chose.
Manual curation: you (and maybe one co-curator) post 2–4 items a week per category, sourced by hand, with a short one- or two-line summary plus the original source link — always credit and link back, never re-host content as your own.
A weekly digest post pinned in one channel, summarizing the week's items for people who don't want live pings.
A feedback channel and a short recurring survey (Google Form) to collect reactions from pilot members.
A pilot group of ~20–40 real design students recruited to actually use it for several weeks.
MVP
├── Discord server (onboarding, rules, roles)
├── Design information categories (trends, events, workshops, competitions, communities)
├── Manual curation workflow (source → summarize → post, 2-4x/week per category)
├── Interest-based roles for targeted notifications (native Discord, no bot)
├── Weekly digest post
├── Original source links on every item
├── Feedback channel + recurring survey
└── Pilot cohort (~20-40 students) for initial testing

Resist scope creep here. Two temptations will show up mid-project and both should be deferred past the MVP: building a bot to automate posting, and building any AI-driven content sourcing. Neither is needed to answer the actual research question of the MVP, which is "does curated, categorized, opt-in delivery in Discord actually help design students discover things they'd otherwise miss?" A human doing it manually for a few weeks answers that question just as well as automation would, at a fraction of the engineering risk.

4. Final Goals (Beyond the MVP)

Once the MVP validates that students find real value in this, later phases could include:

Automated content sourcing — RSS/API pulls from Behance, Dribbble, Eventbrite, design blogs — surfaced to a human curator for approval rather than posted automatically.
A lightweight custom bot for reaction-role management, scheduled digests, and submission intake (members suggesting events/resources themselves).
A public submission form so the community contributes content, reducing the single-curator bottleneck.
Cross-posting the weekly digest to email or Instagram for reach beyond Discord.
Partnerships with design schools or student design communities to seed multiple cohorts.
A moderation structure as the server grows past what one or two people can manage.
If (and only if) sustained engagement and clear demand justify it: revisiting the original standalone app concept, now backed by real evidence of what content and delivery format people actually act on.
5. MVP vs Final Goals

The MVP proves the concept — that centralized, curated, opt-in design information delivered somewhere students already are is genuinely useful — using entirely manual effort and native Discord features. The final-goals stage is about scaling the concept — removing the single-curator bottleneck through automation and community contribution, and extending reach beyond one Discord server. The dividing line is deliberate: nothing in the MVP requires custom software; everything in the final goals does. That's what keeps this a testable capstone project rather than a repeat of the original overscoped app idea.

6. AI-Involvement Level

Recommended level: light, internal, curator-facing only — not a user-facing feature.

Use AI as a personal productivity aid while curating: summarizing a long article into a two-line post, drafting digest copy, suggesting category taglines, or helping you scan a backlog of links faster. Do not build AI-driven content recommendation, scraping, or auto-posting into the MVP, and do not market "AI" as part of the product's value proposition at this stage.

7. Why I Chose This AI-Involvement Level

Three reasons. First, the entire value proposition of this MVP is trust in curation — the moment content is auto-selected or auto-summarized by an unsupervised system, you introduce the risk of low-quality, off-topic, or outright wrong items reaching students, which undermines the one thing you're trying to prove works. Second, a capstone timeline doesn't have room to build and debug a scraping/recommendation pipeline alongside actually running a pilot community — that's the same scope-creep trap that sank the original app idea, just relocated. Third, you don't need AI to answer your research question. The question is about delivery format and curation value, not about automation feasibility — so AI should stay a background tool that makes you faster, not a subsystem the MVP depends on.

8. Success Criteria

Define success before you launch the pilot, not after:

Adoption: at least 20–30 of your recruited pilot members actively join and set at least one interest role.
Engagement: a meaningful share (e.g., 50%+) of members react to, click, or respond to posts over a 3–4 week pilot window — track link clicks with a shortener (Bitly or similar) since Discord doesn't give you this natively.
Retention: members don't mass-leave after the first week; check server member count and channel activity weekly.
Behavioral signal (the strongest evidence): at least a handful of pilot members can point to something specific — a workshop attended, a competition entered, a community joined — that they say they wouldn't have found otherwise. Get this via short interviews (5–8 people) at the end of the pilot, not just the survey.
Qualitative feedback: the recurring survey and feedback channel show more "this is useful, keep it" than "this is just another feed I ignore."

If the pilot instead shows low engagement or people saying it duplicates accounts they already follow, that's a valid and useful capstone finding too — it would mean the real problem is filtering/trust rather than scattering, and the next iteration should pivot the value proposition rather than just add more channels.

9. Risks & Challenges
Curator bottleneck: manual curation is real ongoing labor. A single-person pipeline is a single point of failure — plan for what happens if you're busy with other coursework for a week.
Discord adoption isn't guaranteed: design students may be less Discord-native than gamers or developers. Validate this directly (a quick poll of your target audience) rather than assuming it, since the whole MVP depends on people already being comfortable there.
Indistinguishability from "just follow good accounts": if the server feels like a slower version of Instagram, there's no reason to switch. The differentiator has to be felt — better signal-to-noise, opt-in relevance, no algorithm — not just claimed.
Novelty drop-off: community engagement tends to spike at launch and decay afterward; design the pilot window (3–4 weeks minimum) to actually observe this rather than measuring only week one.
Attribution/IP: always link to original sources and credit creators; never re-host images or full text as if it were your own curation output.
Notification fatigue: over-pinging even opted-in roles will train people to mute the server. Keep cadence disciplined (a defined number of posts per category per week) rather than posting reactively.
Scope creep back toward the original app idea: the pull to "just add a bot" or "just build a simple website too" will show up mid-project — treat any such addition as a Final Goals item, not an MVP item, unless the pilot data explicitly demands it.
10. Development Roadmap

Assuming roughly a 10–14 week capstone timeline:

Weeks 1–2 — Validate & design: quick peer survey/interviews to test the scattering-vs-filtering assumption; finalize categories and server structure based on what you learn.
Weeks 3–4 — Build the server: set up channels, roles, onboarding flow, rules, and feedback channel; seed each category with an initial batch of content so it doesn't launch empty.
Weeks 5–8 — Pilot: recruit 20–40 students; run the curation cadence live; post the weekly digest; keep a simple content-tracking sheet (source, category, date posted, link clicks).
Weeks 9–10 — Feedback & iteration: send the survey, run 5–8 short interviews, adjust categories/cadence/roles based on what you find; consider a short second iteration if time allows.
Weeks 11–12+ — Synthesize & present: pull together engagement data, qualitative findings, and a clear-eyed account of what worked and what didn't, plus the Final Goals roadmap as the "next iteration" story for your capstone writeup or presentation.