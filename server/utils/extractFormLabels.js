// Heuristic, deterministic extraction of likely form-field labels from a
// registration page's extracted text. Real application-form prompts are
// short lines that either ask a question ("Why do you want to join?") or
// end in a colon ("Full name:", "Phone number:") AND contain a field-ish
// word. Marketing/body copy (bullet lists, feature blurbs, headings) is
// deliberately excluded — matching a keyword anywhere in a long sentence
// is not enough, since that pulls in prose like "Practical knowledge,
// experienced mentors, portfolio building" which is not a form field.
const FIELD_WORDS = /(name|email|phone|mobile|college|university|institute|course|branch|year of study|portfolio|linkedin|github|experience|why (do|are|would)|reason for|motivation|expectation)/i;
const BULLET_SEPARATORS = /[·|•]/;

// Returns [{ text, type }], type is "question" (free-text, ends in '?') or
// "field" (short structured prompt, e.g. "Phone number:"). The distinction
// matters downstream: only real questions are eligible for the agent to
// draft an answer; unmatched structured fields are marked "needs input"
// rather than have content invented for them.
function extractFormLabels(pageText) {
  if (!pageText) return [];
  const lines = pageText.split("\n").map((l) => l.trim()).filter(Boolean);
  const seen = new Set();
  const labels = [];

  for (const line of lines) {
    if (line.length < 3 || line.length > 90) continue;
    if (BULLET_SEPARATORS.test(line)) continue; // marketing bullet, not a field
    if ((line.match(/,/g) || []).length > 2) continue; // long comma-separated prose

    const isQuestion = /\?\s*$/.test(line);
    const isColonLabel = /:\s*$/.test(line) && FIELD_WORDS.test(line);
    if (!isQuestion && !isColonLabel) continue;

    const wordCount = line.split(/\s+/).length;
    if (wordCount > 14) continue; // real field prompts are short

    const text = line.replace(/[:]+\s*$/, "").trim();
    if (seen.has(text)) continue;
    seen.add(text);
    labels.push({ text, type: isQuestion ? "question" : "field" });
  }
  return labels.slice(0, 20);
}

module.exports = { extractFormLabels };
