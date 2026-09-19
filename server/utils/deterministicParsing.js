// Deterministic (non-Gemini) parsing for the Workshop Research Agent.
//
// The previous architecture spent a Gemini call on every one of these
// steps, even for requests plain code can parse reliably — burning 4-6
// Gemini calls per search against a 20/day free-tier quota. This module
// does the mechanical parts with ordinary JavaScript, so Gemini is spent
// only on the one step that genuinely needs semantic judgment: verifying
// and structuring a specific candidate against real page evidence.

const KNOWN_CITIES = [
  "pune", "mumbai", "bengaluru", "bangalore", "delhi", "new delhi", "hyderabad",
  "chennai", "kolkata", "ahmedabad", "gurgaon", "gurugram", "noida", "nashik",
  "nagpur", "jaipur", "surat", "indore", "chandigarh", "kochi", "coimbatore",
];

const TYPE_KEYWORDS = [
  { re: /\bworkshops?\b/i, type: "Workshops" },
  { re: /\bcompetitions?\b|\bchallenges?\b|\bhackathons?\b/i, type: "Competitions" },
  { re: /\bconferences?\b|\btalks?\b|\bmeetups?\b|\bevents?\b/i, type: "Events" },
  { re: /\bcommunit(y|ies)\b/i, type: "Communities" },
];

const DESIGN_KEYWORDS = [
  "design", "ux", "ui", "graphic", "typography", "illustration", "branding",
  "product design", "service design", "visual communication", "animation",
  "motion design", "3d", "interaction design", "design thinking", "design research",
  "creative", "figma", "portfolio",
];

// PERCEIVE: extract location/type/audience from the raw request with plain
// string matching. Returns { location, opportunityType, audience,
// searchQuery, confident }. `confident` tells the caller whether this is
// reliable enough to skip Gemini entirely, or whether a Gemini fallback is
// worth attempting (only if Gemini is actually available).
function parseRequestDeterministically(query) {
  const lower = query.toLowerCase();

  const location = KNOWN_CITIES.find((city) => new RegExp(`\\b${city}\\b`, "i").test(lower)) || "";
  const typeMatch = TYPE_KEYWORDS.find((t) => t.re.test(lower));
  const audience = /design student/i.test(lower)
    ? "design students"
    : /student/i.test(lower)
    ? "students"
    : "";

  return {
    location: location ? location.replace(/\b\w/g, (c) => c.toUpperCase()) : "",
    opportunityType: typeMatch ? typeMatch.type : "",
    audience,
    searchQuery: query, // Tavily handles natural-language queries directly — no reconstruction needed
    confident: Boolean(location && typeMatch),
  };
}

// REASON (parse candidates): Tavily's own MCP server formats search results
// in a stable, fixed structure (confirmed live: "Title: ... \nID: ...
// \nURL: ... \nContent: ..." per result, separated by blank lines) — this is
// the server's own formatting code, not model-generated text, so it's safe
// to parse with a regex instead of spending a Gemini call on it.
function parseTavilySearchResults(rawText) {
  if (!rawText) return [];
  const results = [];
  const re = /Title:\s*(.+?)\s*\n(?:ID:\s*\S*\s*\n)?URL:\s*(\S+)\s*\nContent:\s*([\s\S]*?)(?=\n\nTitle:|\n\nImages:|$)/g;
  let m;
  while ((m = re.exec(rawText))) {
    results.push({
      name: m[1].trim(),
      url: m[2].trim(),
      snippet: m[3].trim().replace(/\s+/g, " ").slice(0, 800),
      location: "", // not a separate field in Tavily's raw text — the Pune filter also checks name+snippet
    });
  }
  return results;
}

// Cheap pre-filter so Gemini's one genuinely-needed call (verification) is
// only spent on candidates that plausibly relate to design at all.
function isLikelyDesignRelevant(candidate) {
  const haystack = `${candidate.name} ${candidate.snippet}`.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => haystack.includes(kw));
}

module.exports = { parseRequestDeterministically, parseTavilySearchResults, isLikelyDesignRelevant, KNOWN_CITIES };
