// Shared schema definitions for the Design World Workshop Research Agent
// and the Workshop Application Preparation & Approval skill adapter.
//
// Gemini's structured-output "Schema" format uses uppercase type names
// (OBJECT/STRING/ARRAY/BOOLEAN) — these are Gemini schemas, not JSON Schema.

const VERIFICATION_STATUS_VALUES = ["verified", "unverified", "conflicting"];
const FIELD_STATUS_VALUES = ["filled", "needs_input"];

// PERCEIVE + REASON: turn the free-text request into concrete search criteria.
const INTERPRETATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    location: { type: "STRING", description: "The city the user asked about, e.g. Pune. Empty if none stated." },
    opportunityType: { type: "STRING", description: "e.g. workshop" },
    audience: { type: "STRING", description: "e.g. design students" },
    searchQuery: { type: "STRING", description: "A concrete web search query to find real candidates" },
  },
  required: ["searchQuery"],
};

// REASON: parse raw search-result text into structured candidates. Gemini is
// told explicitly to use ONLY what's in the search text — never invent a
// candidate that isn't actually present in the results.
const CANDIDATES_SCHEMA = {
  type: "OBJECT",
  properties: {
    candidates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          organizer: { type: "STRING" },
          location: { type: "STRING", description: "City/venue location as stated in the source, verbatim" },
          url: { type: "STRING" },
          snippet: { type: "STRING" },
        },
        required: ["name", "url"],
      },
    },
  },
  required: ["candidates"],
};

// REASON (2nd pass): assess design-relevance and verify/structure one
// candidate against real fetched page evidence.
//
// startTime/endTime use the sentinel "unconfirmed" (not "Not found") because
// they feed the calendar-blocking feature directly — the agent must never
// guess a time slot it isn't sure of. dayOfWeek is deliberately NOT asked of
// Gemini: it's computed from `date` in code (see computeDayOfWeek in
// workshopResearchAgent.js) so it can never disagree with the date itself.
const WORKSHOP_VERIFICATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    organizer: { type: "STRING" },
    venue: { type: "STRING" },
    location: { type: "STRING" },
    date: { type: "STRING", description: "ISO date (YYYY-MM-DD) if determinable from evidence, else 'unconfirmed'" },
    startTime: { type: "STRING", description: "24-hour HH:MM if stated in evidence, else 'unconfirmed'" },
    endTime: { type: "STRING", description: "24-hour HH:MM if stated or derivable from a stated duration, else 'unconfirmed'" },
    eligibility: { type: "STRING" },
    price: { type: "STRING" },
    registrationDeadline: { type: "STRING" },
    registrationUrl: { type: "STRING" },
    imageUrl: {
      type: "STRING",
      description:
        "One real image URL copied VERBATIM from the page evidence's image markdown that plausibly represents this specific workshop/event (a poster, banner, or hero image) — empty string if no such image is present in the evidence.",
    },
    isDesignRelevant: { type: "BOOLEAN" },
    designRelevanceEvidence: { type: "STRING" },
    verificationStatus: { type: "STRING", enum: VERIFICATION_STATUS_VALUES },
    verificationNotes: { type: "STRING" },
  },
  required: ["name", "isDesignRelevant", "verificationStatus"],
};

// Application-preparation output (Workshop Application Preparation & Approval skill).
const APPLICATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    fields: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          label: { type: "STRING" },
          value: { type: "STRING" },
          status: { type: "STRING", enum: FIELD_STATUS_VALUES },
          source: { type: "STRING", enum: ["user_profile", "workshop_record", "none"] },
        },
        required: ["key", "label", "status"],
      },
    },
    requiresManualAction: { type: "BOOLEAN" },
    manualActionReasons: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["fields", "requiresManualAction"],
};

// Optional Gemini enhancement for the Skill: identify application questions
// on the REAL registration page beyond the standard profile fields (which
// are matched deterministically, with no Gemini call needed at all). This
// is the one genuinely judgment-requiring part of application prep — never
// used to fill in a value, only to notice a field exists.
const EXTRA_FIELDS_SCHEMA = {
  type: "OBJECT",
  properties: {
    extraFields: {
      type: "ARRAY",
      description: "Application questions found in the real page evidence that aren't already covered by name/email/phone/college/course/year/portfolio.",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING", description: "short snake_case key" },
          label: { type: "STRING", description: "the actual question/label as it appears on the page" },
        },
        required: ["key", "label"],
      },
    },
    requiresManualAction: { type: "BOOLEAN" },
    manualActionReasons: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["extraFields"],
};

function emptyWorkshopRecord() {
  return {
    name: "Not found",
    type: "workshop",
    organizer: "Not found",
    venue: "Not found",
    location: "Not found",
    date: "unconfirmed",
    dayOfWeek: "unconfirmed",
    startTime: "unconfirmed",
    endTime: "unconfirmed",
    eligibility: "Not found",
    price: "Not found",
    registrationDeadline: "Not found",
    registrationUrl: "Not found",
    imageUrl: null,
    sourceUrls: [],
    verificationStatus: "unverified",
    verificationNotes: "",
  };
}

// Structures real search-with-images results into trend items. imageUrl
// must be one of the URLs Tavily actually returned in its Images list, or
// null — Gemini is instructed never to invent one.
const TRENDS_SCHEMA = {
  type: "OBJECT",
  properties: {
    trends: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          summary: { type: "STRING" },
          category: { type: "STRING" },
          designer: { type: "STRING", description: "The designer/creator/studio actually named in the evidence for this specific work, verbatim. Empty string if none is named — never invent a name." },
          location: { type: "STRING", description: "City/country actually stated for the designer/studio in the evidence, verbatim. Empty string if not stated." },
          source: { type: "STRING", description: "One of the result URLs, verbatim" },
          imageUrl: { type: "STRING", description: "One of the Images list URLs that actually matches this trend, or empty string if none match" },
        },
        required: ["title", "summary", "source"],
      },
    },
  },
  required: ["trends"],
};

module.exports = {
  VERIFICATION_STATUS_VALUES,
  FIELD_STATUS_VALUES,
  INTERPRETATION_SCHEMA,
  CANDIDATES_SCHEMA,
  WORKSHOP_VERIFICATION_SCHEMA,
  APPLICATION_SCHEMA,
  EXTRA_FIELDS_SCHEMA,
  TRENDS_SCHEMA,
  emptyWorkshopRecord,
};
