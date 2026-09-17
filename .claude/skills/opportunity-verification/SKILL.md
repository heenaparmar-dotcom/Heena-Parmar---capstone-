---
name: Opportunity Verification & Structuring
description: Use this skill when you have raw, partial, or unverified information about ONE design opportunity (a competition, workshop, event, or community opportunity) and need to verify its details against credible sources and structure it into a reliable opportunity record. Do not use this skill to discover opportunities, scrape social media, fill in registration forms, submit applications, or manage multiple opportunities at once — it handles exactly one opportunity, one verification-and-structuring pass at a time.
---

# Opportunity Verification & Structuring

## Purpose

This skill performs exactly one repeatable task for Design Radar: given whatever
information is currently known about a single design opportunity, verify that
information against credible sources and produce one structured, trustworthy
opportunity record.

This skill does **not**:
- discover or search for opportunities on its own initiative
- scrape Instagram/X or any social platform
- fill in or submit registration forms or applications
- post, notify, or automate calendar entries
- process more than one opportunity per run

If asked to do any of the above, decline and clarify that this skill only
verifies and structures a single already-identified opportunity.

## Input

You will receive whatever fields are available for one opportunity. Common
fields include, but are not limited to:

- title
- source URL
- opportunity type
- organizer
- description
- date
- deadline
- eligibility
- location
- registration URL

Treat missing fields as missing — do not assume they exist. If the input is
ambiguous about whether it describes one opportunity or several, ask for
clarification before proceeding, since this skill only ever processes one
opportunity per run.

## Process

Work through these steps in order.

### 1. Determine the opportunity category

Classify the opportunity as one of:
- Design competition
- Design workshop
- Design event
- Design community opportunity

Base the category only on what the input actually states or on what a
credible source confirms. If the category is genuinely ambiguous even after
verification, say so rather than guessing.

### 2. Identify the target audience

From the available description/eligibility text, identify who the opportunity
is aimed at (e.g., undergraduate design students, early-career designers,
a specific discipline like UI/UX or graphic design, open to all students,
etc.). If this cannot be determined, mark it as not found rather than
inferring one.

### 3. Assess relevance to design students

Judge whether this opportunity is relevant to design students specifically
(the primary Design Radar audience). Base this on the category, audience,
and description — not on assumption. Be prepared to justify this judgment
briefly in the final record's "Reason for relevance" field.

### 4. Verify against a credible source

Prefer verification in this order:
1. An official source (the organizer's own website, official event page, or
   official registration page).
2. A credible secondary source (established design publication, school/
   institutional page, well-known competition platform) if no official
   source is available or accessible.
3. The source URL originally supplied, if neither of the above is available.

When verifying, actively look up or re-check the following fields if
possible:
- title
- organizer
- date
- deadline
- eligibility
- location / online status
- registration URL
- source URL

Cross-check the supplied information against the credible source rather than
just repeating what was given. If the supplied information conflicts with
the credible source, trust the credible source and note the discrepancy.

### 5. Distinguish verified from unverified information

For every field in the final record, you must know whether it was:
- **Verified** — confirmed against an official or credible source during
  this run.
- **Unverified** — present in the input but not confirmed against a
  credible source.
- **Not found** — not present in the input and not discoverable from a
  credible source.

Never blur these categories together in the output.

### 6. Never invent information

If a detail cannot be found or verified, do not fill it in with a plausible
guess, a typical value, or an assumption. Explicitly write "Unverified" or
"Not found" for that field instead. This rule overrides any temptation to
produce a more "complete-looking" record.

## Output

Produce exactly one structured record using this template, filling in every
field. Where information is missing or unverified, write "Unverified" or
"Not found" rather than leaving a field blank or inventing a value.

```
Title:
Category:
Organizer:
Target audience:
Date:
Deadline:
Location:
Eligibility:
Registration URL:
Source URL:
Relevance to design students:
Verification status:
Missing or unverified information:
Reason for relevance:
```

Notes on specific fields:
- **Verification status**: summarize overall confidence, e.g. "Fully
  verified against organizer's official site", "Partially verified —
  deadline unconfirmed", or "Unverified — no credible source found".
- **Missing or unverified information**: list every field that is
  "Unverified" or "Not found" by name. If everything was verified, state
  that explicitly (e.g., "None — all fields verified").
- **Reason for relevance**: one or two sentences explaining, based on the
  category and target audience, why (or why not) this belongs in Design
  Radar's opportunity feed for design students.

## Use inside an agentic loop

This skill is designed to be one step inside a larger agent workflow:

1. The agent perceives/discovers a candidate opportunity (outside this
   skill's scope).
2. The agent invokes this skill with whatever raw information it has
   gathered.
3. This skill identifies which fields still need verification.
4. The agent performs additional searches to verify those specific fields
   and reports findings back.
5. This skill incorporates those findings and produces the final structured
   record above.

This skill should always leave a clear, explicit trail of what is confirmed
versus what remains uncertain, so the calling agent (or a human reviewer)
knows exactly what still needs checking.
