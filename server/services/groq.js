const Groq = require("groq-sdk");

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set.");
    }
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

class GroqUnavailableError extends Error {}

function isOverloaded(err) {
  return /"code":503|UNAVAILABLE|overloaded|rate_limit|429/i.test(err.message || "");
}

// Sends one prompt, expects one JSON object back. Retries only on genuine
// transient overload/rate-limit errors; never fabricates a result on
// failure — throws GroqUnavailableError instead so callers can report
// honestly. `system` should state the task and require JSON-only output;
// Groq's json_object mode is enforced at the API level but the exact shape
// is only prompt-enforced, so callers must validate the parsed shape.
async function generateJson(system, userPrompt, attempt = 1) {
  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Groq returned an empty response.");
    return JSON.parse(text);
  } catch (err) {
    if (isOverloaded(err) && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 1200));
      return generateJson(system, userPrompt, attempt + 1);
    }
    if (isOverloaded(err)) {
      throw new GroqUnavailableError(err.message);
    }
    throw err;
  }
}

// Ranks/filters raw search candidates against stored preferences. Returns
// at most 10 items, each carrying a `whyMatched` explanation grounded in
// the real candidate text — never invents a candidate that wasn't passed in.
async function rankEvents(candidates, preferences) {
  const system =
    "You rank real event/workshop search results against a user's stated preferences. " +
    "You must ONLY use the candidates given to you — never invent an event that is not in the list. " +
    'Respond with JSON: {"ranked": [{"index": <candidate index>, "whyMatched": "<short reason>"}]}, ' +
    "at most 10 items, best matches first. If a candidate doesn't genuinely match, omit it.";
  const userPrompt = JSON.stringify({ preferences, candidates });
  const result = await generateJson(system, userPrompt);
  if (!Array.isArray(result.ranked)) throw new Error("Groq rankEvents returned an unexpected shape.");
  return result.ranked
    .filter((r) => Number.isInteger(r.index) && candidates[r.index])
    .slice(0, 10)
    .map((r) => ({ ...candidates[r.index], whyMatched: r.whyMatched || "" }));
}

// Maps known applicant fields onto real form field labels extracted from a
// registration page. Only fills fields it can confidently match; anything
// else is left for draftFreeTextAnswer or "Needs your input".
async function mapApplicationFields(formFieldLabels, applicantDetails) {
  const system =
    "You map a real registration form's field labels onto a user's known applicant details. " +
    "Only map a field if you are confident it corresponds to a known detail (name, phone, email, college, course, year, portfolio). " +
    'Respond with JSON: {"mappings": [{"label": "<original label>", "value": "<matched value>"}]}. ' +
    "Do not include a field you cannot confidently map — leave it out entirely.";
  const userPrompt = JSON.stringify({ formFieldLabels, applicantDetails });
  const result = await generateJson(system, userPrompt);
  if (!Array.isArray(result.mappings)) throw new Error("Groq mapApplicationFields returned an unexpected shape.");
  return result.mappings;
}

// Drafts a reasonable answer for ONE free-text application question that has
// no stored applicant detail to match. Explicitly the only place in this
// app where the agent is allowed to generate content rather than use only
// known facts — the caller must show this to the user as agent-generated
// before submission.
async function draftFreeTextAnswer(question, applicantDetails) {
  const system =
    "You draft a short answer to fill directly into a single application form field — not a sentence " +
    "explaining yourself, the literal value that belongs in the box (e.g. for 'What company do you work for?' " +
    "with a student applicant, answer 'Student' or 'N/A', not a sentence about not being employed). " +
    "Use only the applicant details given as context; never invent specifics not implied by them. " +
    'Respond with JSON: {"answer": "<short value, a few words at most>"}.';
  const userPrompt = JSON.stringify({ question, applicantDetails });
  const result = await generateJson(system, userPrompt);
  if (typeof result.answer !== "string") throw new Error("Groq draftFreeTextAnswer returned an unexpected shape.");
  return result.answer;
}

// Classifies a real email body as approval/rejection/unclear for a given
// application/event context.
async function classifyEmailReply(emailText, eventName) {
  const system =
    "You classify a real email reply about an event/workshop application. " +
    'Respond with JSON: {"classification": "approved"|"rejected"|"unclear", "reason": "<short quote or paraphrase from the email>"}.';
  const userPrompt = JSON.stringify({ eventName, emailText: emailText.slice(0, 4000) });
  const result = await generateJson(system, userPrompt);
  if (!["approved", "rejected", "unclear"].includes(result.classification)) {
    throw new Error("Groq classifyEmailReply returned an unexpected shape.");
  }
  return result;
}

// Structures raw real search-result text into design-trend items with
// designer/city/country attribution. Only uses what's actually stated in
// the source text — any field not mentioned is left null, never guessed
// (a designer's city/country is often not stated, and that's fine).
async function extractTrends(rawText) {
  const system =
    "You extract real design-trend items from real web search result text. " +
    "For each distinct trend/project/designer mentioned, extract only facts actually stated in the text. " +
    "If country, city, or designer name isn't stated, use null for that field — never guess or infer one. " +
    'Respond with JSON: {"trends": [{"title": "<trend or project name>", "designerName": string|null, ' +
    '"city": string|null, "country": string|null, "summary": "<1-2 sentence summary from the source text>", ' +
    '"sourceUrl": "<url from the text, if present>"}]}, at most 10 items.';
  const result = await generateJson(system, rawText.slice(0, 6000));
  if (!Array.isArray(result.trends)) throw new Error("Groq extractTrends returned an unexpected shape.");
  return result.trends;
}

// "Talk to me" — a free-form profile chat. Extracts durable personal facts
// (interests, pursuits, background, skills, project experience) the user
// mentions and merges them into a running notes blob used later to answer
// open-ended application questions. Never invents a fact the user didn't
// state; the reply is conversational, the notes are the durable memory.
async function updateProfileFromChat(existingNotes, userMessage) {
  const system =
    "You are Design World's profile assistant. The user is telling you about themselves — their interests, " +
    "what they're pursuing (course/career/projects), skills, and background — so this can be used later to " +
    "answer open-ended workshop/event application questions on their behalf. " +
    "Merge any new durable facts from their message into the existing notes (keep it a short bullet list, " +
    "not a transcript; don't duplicate facts already present; don't invent anything they didn't say). " +
    'Respond with JSON: {"reply": "<short conversational reply, e.g. confirm what you noted or ask a natural follow-up>", ' +
    '"updatedNotes": "<the full merged bullet-list notes, replacing the old ones>"}.';
  const userPrompt = JSON.stringify({ existingNotes: existingNotes || "", userMessage });
  const result = await generateJson(system, userPrompt);
  if (typeof result.reply !== "string" || typeof result.updatedNotes !== "string") {
    throw new Error("Groq updateProfileFromChat returned an unexpected shape.");
  }
  return result;
}

module.exports = {
  generateJson,
  rankEvents,
  mapApplicationFields,
  draftFreeTextAnswer,
  classifyEmailReply,
  extractTrends,
  updateProfileFromChat,
  GroqUnavailableError,
};
