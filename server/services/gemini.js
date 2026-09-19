// Gemini reasoning layer for the Design World Workshop Research Agent.
//
// This is the ONLY module that talks to the Gemini API. It never logs or
// returns the API key. GEMINI_API_KEY must be set (via .env, loaded by
// server.js) before any function here is called.
//
// Every prompt in this file explicitly tells Gemini to use only the
// evidence it's given and to return "Not found" / false / empty rather than
// guess — this is what keeps the agent from hallucinating workshop details.

const { GoogleGenAI } = require("@google/genai");
const {
  INTERPRETATION_SCHEMA,
  CANDIDATES_SCHEMA,
  WORKSHOP_VERIFICATION_SCHEMA,
  APPLICATION_SCHEMA,
  TRENDS_SCHEMA,
} = require("../schemas");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

let client = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to a root .env file (see .env.example) before running the agent."
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOverloaded(err) {
  return /"code":503|UNAVAILABLE|overloaded|high demand/i.test(err.message || "");
}

// Gemini's public models genuinely return transient 503 "high demand" errors
// under real load — this retries that specific, real condition a couple of
// times with backoff rather than failing the whole agent run on it. It never
// retries other errors, and never fabricates a response if all retries fail.
async function generateJson(prompt, responseSchema, attempt = 1) {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema },
    });
    try {
      return JSON.parse(response.text);
    } catch (err) {
      throw new Error("Gemini returned a response that could not be parsed as JSON.");
    }
  } catch (err) {
    if (isOverloaded(err) && attempt < 3) {
      const delay = attempt * 1500;
      console.log(`[gemini] Model overloaded, retrying in ${delay}ms (attempt ${attempt + 1}/3)`);
      await sleep(delay);
      return generateJson(prompt, responseSchema, attempt + 1);
    }
    throw err;
  }
}

// PERCEIVE + REASON
async function interpretRequest(query) {
  const prompt = `You are the reasoning layer of a workshop-research agent for design students.
A user submitted this request:

"${query}"

Extract the search criteria. If the request states a specific city, put it
in "location" exactly as stated — do not substitute a nearby or larger city.
If no city is stated, leave "location" empty; never assume one.`;
  return generateJson(prompt, INTERPRETATION_SCHEMA);
}

// REASON (parse real search results into structured candidates)
async function extractCandidates(criteria, rawSearchResultsText) {
  const prompt = `You are extracting candidate workshops from REAL web search results.
Search criteria: ${JSON.stringify(criteria)}

Raw search results:
${rawSearchResultsText}

List every plausible candidate workshop/event you can find in these results.
Use ONLY information present in the text above — never invent a candidate,
a URL, or a location that isn't actually there. Copy the location field
verbatim from the source text (do not normalize or guess a city).`;
  const result = await generateJson(prompt, CANDIDATES_SCHEMA);
  return result.candidates || [];
}

// REASON (assess design-relevance + structure one candidate against real
// fetched page evidence)
async function verifyWorkshop(candidate, pageEvidence) {
  const prompt = `You are verifying and structuring ONE candidate workshop for design
students, using ONLY the evidence below. Never invent a value not
supported by the evidence — use "Not found" (string) for unknown text
fields, and be conservative with isDesignRelevant and verificationStatus.

Candidate (from real web search, not yet verified):
${JSON.stringify(candidate, null, 2)}

Page evidence (fetched from the candidate's own URL; may be incomplete or
empty if extraction failed — in that case rely only on the candidate
snippet and mark fields you cannot confirm as "Not found", and
verificationStatus as "unverified"):
"""
${pageEvidence || "(no page content could be extracted)"}
"""

Assess:
1. isDesignRelevant — true only if the evidence actually indicates a
   design discipline (graphic design, UX/UI, product design, service
   design, visual communication, typography, illustration, animation, 3D,
   interaction design, design research/thinking, creative technology,
   design entrepreneurship). Do not guess from the title alone.
2. verificationStatus — "verified" only if key facts (name, date, venue)
   are corroborated by the evidence; "conflicting" if sources disagree;
   otherwise "unverified".
3. date — an ISO date (YYYY-MM-DD) ONLY if the evidence states or clearly
   implies one; otherwise "unconfirmed". Do not guess a year or convert a
   vague phrase like "this weekend" into a specific date.
4. startTime / endTime — 24-hour HH:MM ONLY if the evidence states a
   specific time (or a duration you can add to a stated start time);
   otherwise "unconfirmed" for whichever one isn't actually stated. These
   two fields will be used to block real calendar time, so never estimate
   or round a time that wasn't actually given.
5. imageUrl — the evidence may contain real images written as markdown
   image syntax, e.g. ![alt text](https://...). If one of them is plausibly
   a poster/banner/hero image for THIS specific workshop (not a site logo,
   nav icon, ad, unrelated promoted event, or a generic decorative image),
   copy that URL VERBATIM. If none plausibly represent this workshop, or no
   images are present in the evidence, return an empty string — never
   invent an image URL and never reuse a stock/generic image as if it were
   the real event image.
6. Structure every other field from the evidence, or "Not found".`;
  return generateJson(prompt, WORKSHOP_VERIFICATION_SCHEMA);
}

// Used by the Workshop Application Preparation & Approval skill adapter.
async function generateStructuredJson(prompt, responseSchema) {
  return generateJson(prompt, responseSchema);
}

// Structures real Tavily search-with-images results into design trend items.
async function extractTrends(rawResultsWithImages) {
  const prompt = `You are structuring real, current design-trend search results into
distinct trend items for a design discovery product.

Raw results (includes a "Detailed Results" section with real articles, and
a separate "Images" section with real image URLs and descriptions):
${rawResultsWithImages}

Produce 4-6 distinct trend items. For each:
- title: a short, specific trend name (not just the article title)
- summary: 1-2 sentences, based only on the actual content above
- category: e.g. "Visual/Graphic Design", "UX/Product Design", "AI + Design"
- designer: only if a specific designer, creator, or studio is actually
  named in the evidence for this work — copy it verbatim. If no one is
  named, leave this an empty string. Never attribute a design to a person
  or studio who isn't actually mentioned.
- location: only if a city/country is actually stated for that
  designer/studio in the evidence — copy it verbatim, else empty string.
- source: copy one of the result URLs above VERBATIM — never invent a URL
- imageUrl: look at the Images list above and pick the ONE image whose
  description most plausibly represents this specific trend. Copy that URL
  VERBATIM from the Images list. If no image in the list is a reasonable
  match for this trend, leave imageUrl as an empty string — never invent an
  image URL or reuse a stock image that doesn't actually relate to the
  trend's content.`;
  const result = await generateJson(prompt, TRENDS_SCHEMA);
  return result.trends || [];
}

module.exports = {
  MODEL,
  interpretRequest,
  extractCandidates,
  verifyWorkshop,
  generateStructuredJson,
  extractTrends,
};
