---
name: Workshop Application Preparation & Approval
description: Use this skill when a user has selected exactly ONE already-discovered workshop opportunity and wants help preparing its registration/application. It maps only known, user-approved information onto the workshop's real form fields, never invents missing data, and always stops for explicit user approval before anything is treated as submitted. Do not use this skill to discover, shortlist, or choose between workshops — that is the Workshop Research Agent's job, not this skill's.
---

# Workshop Application Preparation & Approval

## Purpose

This skill performs exactly one repeatable task: given ONE selected, already
verified workshop record and the user's own known profile information,
prepare that workshop's application for the user's review — filling only
what is genuinely known, clearly marking everything else as needing the
user's input, and never proceeding to submission without explicit approval.

This skill does **not**:
- discover workshops or opportunities
- decide which workshop the user should attend
- shortlist or rank multiple workshops
- invent or guess any field value
- submit anything automatically
- bypass CAPTCHA, OTP, payment, signatures, or legal declarations

If asked to do any of the above, decline and clarify that this skill only
prepares an application for one already-selected workshop.

## Scope

Exactly one workshop, one application-preparation pass, per run.

## Inputs

- **workshop**: the one selected, structured workshop record (name,
  organizer, venue, location, date, time, eligibility, price,
  registrationDeadline, registrationUrl, sourceUrls, verificationStatus).
- **userProfile**: whatever the user has actually provided themselves
  (e.g. name, email, phone, college, year, portfolio URL, design
  interests). Treat anything not present as unknown — never assume a
  default or a plausible-sounding value.
- **formEvidence** (when available): real content fetched from the
  workshop's own registration/application page, used to identify actual
  field labels and any red-flag requirements (CAPTCHA, OTP, payment,
  signature, legal declaration, sensitive identity documents). If this
  evidence is unavailable, treat the form's exact fields as unknown rather
  than guessing a generic form.

## Process

### 1. Identify required fields

From the real form evidence when available, or from the workshop record
when it is not, identify what the application plausibly needs (name,
email, phone, college, year, portfolio, prior experience, and any
workshop-specific questions). Do not invent fields that aren't evidenced.

### 2. Map known information only

For each field, map it from `userProfile` or the workshop record if — and
only if — the value is directly present. Never infer, complete, guess, or
paraphrase your way to a value that wasn't actually supplied.

### 3. Mark everything else as needing input

Any field without a directly known value is marked `"needs_input"`, not
filled with a placeholder, a guess, or an empty-looking default that could
be mistaken for a real answer.

### 4. Never invent, under any circumstance

This rule has no exceptions. Do not invent:
- name, email, phone number, college, year
- portfolio URL, design experience, prior work
- eligibility answers, demographic information
- payment details, signatures, or legal declarations
- answers to any open-ended application question

### 5. Flag anything requiring manual, human-only action

If the form evidence shows (or the workshop record implies) any of the
following, stop and flag it instead of attempting to work around it:
CAPTCHA, OTP, payment, a signature, a legal declaration, a request for
sensitive identity documents, or any required field with no safe way to
resolve it. These are never bypassed, automated around, or silently
skipped.

### 6. Prepare, do not submit

Produce the application in a `"ready_for_review"` state. This skill never
submits anything itself. Submission — if it happens at all — is a
separate, explicit action gated on the user clicking an unambiguous
"Approve & Submit" control, and only for whatever a human still has to
complete manually where CAPTCHA/OTP/payment/signature/legal declarations
are involved.

## Output format

```
Workshop: <name>
Fields:
  - key: <field name>
    label: <human label>
    value: <known value, or null>
    status: "filled" | "needs_input"
    source: "user_profile" | "workshop_record" | null
Missing fields: [<field keys needing input>]
Requires manual action: true | false
Manual action reasons: [<CAPTCHA, OTP, payment, signature, legal declaration, ...>]
Status: "ready_for_review"
```

## Failure conditions

- No workshop provided, or more than one workshop provided → refuse; this
  skill only ever processes one already-selected workshop.
- Form evidence unavailable → proceed with only the fields that can be
  reasonably identified from the workshop record itself, and mark the
  reduced confidence clearly rather than presenting a fabricated field
  list as complete.
- Any required field cannot be resolved from real, known information →
  mark it `"needs_input"` and leave it there. Do not resolve it any other
  way.
