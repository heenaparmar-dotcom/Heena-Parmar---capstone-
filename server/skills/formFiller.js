const { chromium } = require("playwright");
const groq = require("../services/groq");

function detectPlatform(url) {
  if (!url) return "unknown";
  if (/docs\.google\.com\/forms/i.test(url)) return "google_forms";
  if (/luma\.com/i.test(url)) return "luma";
  if (/^https?:\/\//i.test(url)) return "generic";
  return "unknown";
}

// Maps a real DOM question label to a value. If `overrideMap` (label ->
// value, from a previously reviewed fill) has this label, that exact value
// is reused — no fresh Groq call — so a user-reviewed-then-submitted form
// contains exactly what they saw, never a re-generated answer. Otherwise
// falls back to stored applicant details first (never invented), then
// Groq's typed-question drafting only when nothing stored matches.
async function resolveAnswer(label, applicantDetails, overrideMap) {
  if (overrideMap && Object.prototype.hasOwnProperty.call(overrideMap, label)) {
    return { value: overrideMap[label], source: "reviewed" };
  }
  const lower = label.toLowerCase();
  const direct = [
    [/name/, applicantDetails.fullName],
    [/e-?mail/, applicantDetails.email],
    [/phone|mobile|telephone/, applicantDetails.phone],
    [/college|university|institute/, applicantDetails.college],
    [/course|branch/, applicantDetails.course],
    [/year/, applicantDetails.year],
    [/portfolio|linkedin|github/, applicantDetails.portfolioUrl],
  ];
  for (const [re, value] of direct) {
    if (re.test(lower) && value) return { value, source: "applicant_details" };
  }
  try {
    const answer = await groq.draftFreeTextAnswer(label, applicantDetails);
    return { value: answer, source: "agent_generated" };
  } catch (err) {
    return { value: null, source: "needs_input" };
  }
}

// Fills the real Google Forms DOM. Google Forms renders each question as
// div[role="listitem"] with a role="heading" title and either a text
// input/textarea, or role="radio"/"checkbox" options. Only short-answer/
// paragraph text questions are auto-filled; choice questions are left
// unanswered (flagged) since guessing an option is a fabrication risk this
// project explicitly avoids.
async function fillGoogleForm(page, applicantDetails, overrideMap) {
  const items = await page.locator('div[role="listitem"]').all();
  const filled = [];
  const skipped = [];

  for (const item of items) {
    const heading = await item.locator('[role="heading"]').first().textContent().catch(() => null);
    if (!heading) continue;
    const label = heading.trim();

    const textInput = item.locator("input[type='text'], textarea").first();
    if (await textInput.count()) {
      const { value, source } = await resolveAnswer(label, applicantDetails, overrideMap);
      if (value) {
        await textInput.fill(String(value));
        filled.push({ label, value, source });
      } else {
        skipped.push({ label, reason: "no confident answer available" });
      }
      continue;
    }

    const hasChoices = await item.locator('[role="radio"], [role="checkbox"]').count();
    if (hasChoices) {
      skipped.push({ label, reason: "choice question — not auto-answered to avoid guessing" });
    }
  }

  return { filled, skipped, submitLocator: page.getByRole("button", { name: /submit/i }).first() };
}

// Fills Luma's registration modal. Its fields are real <input>/<textarea>
// elements with a preceding <label> sibling in the same container — no
// aria-labelledby, so the label is found by DOM proximity.
async function fillLumaForm(page, applicantDetails, overrideMap) {
  await page.getByRole("button", { name: "Register", exact: true }).first().click();
  await page.waitForTimeout(1000);

  const inputs = await page.locator("form input, form textarea").all();
  const filled = [];
  const skipped = [];

  for (const input of inputs) {
    const container = input.locator("xpath=ancestor::div[.//label][1]");
    const labelText = await container.locator("label").first().textContent().catch(() => null);
    const label = (labelText || (await input.getAttribute("placeholder")) || "").replace(/\*/g, "").trim();
    if (!label) continue;

    const { value, source } = await resolveAnswer(label, applicantDetails, overrideMap);
    if (value) {
      await input.fill(String(value));
      filled.push({ label, value, source });
    } else {
      skipped.push({ label, reason: "no confident answer available" });
    }
  }

  return { filled, skipped, submitLocator: page.getByRole("button", { name: "Register", exact: true }).last() };
}

// Best-effort label lookup for a real input on an arbitrary site: an
// associated <label for=id>, an aria-label, a placeholder, a wrapping
// <label>, or the nearest ancestor container that also holds a <label> —
// same DOM-proximity idea as the Luma case, generalized since unknown
// sites don't follow one fixed structure.
async function getGenericLabel(page, input) {
  const id = await input.getAttribute("id").catch(() => null);
  if (id) {
    const byFor = page.locator(`label[for="${id}"]`);
    const text = await byFor.first().textContent().catch(() => null);
    if (text && text.trim()) return text.trim();
  }
  const ariaLabel = await input.getAttribute("aria-label").catch(() => null);
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const wrapping = input.locator("xpath=ancestor::label[1]");
  const wrappingText = await wrapping.first().textContent().catch(() => null);
  if (wrappingText && wrappingText.trim()) return wrappingText.trim();

  const container = input.locator("xpath=ancestor::*[self::div or self::li or self::p][.//label][1]");
  const containerLabelText = await container.locator("label").first().textContent().catch(() => null);
  if (containerLabelText && containerLabelText.trim()) return containerLabelText.trim();

  const placeholder = await input.getAttribute("placeholder").catch(() => null);
  if (placeholder && placeholder.trim()) return placeholder.trim();

  const name = await input.getAttribute("name").catch(() => null);
  return name ? name.trim() : null;
}

// Fills a real form on an arbitrary site: any real text-like <input>/
// <textarea> inside a <form> (falling back to page-wide inputs if the page
// has no <form> tag), resolving each field's label by DOM proximity. Choice
// inputs (checkbox/radio/select/file) are never touched — guessing an
// option is a fabrication risk this project explicitly avoids.
async function fillGenericForm(page, applicantDetails, overrideMap) {
  const selector =
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=image]), textarea";
  let inputs = await page.locator(`form ${selector}`).all();
  if (inputs.length === 0) inputs = await page.locator(selector).all();

  const filled = [];
  const skipped = [];

  for (const input of inputs) {
    const label = await getGenericLabel(page, input);
    if (!label) continue;

    const { value, source } = await resolveAnswer(label, applicantDetails, overrideMap);
    if (value) {
      await input.fill(String(value)).catch(() => {});
      filled.push({ label, value, source });
    } else {
      skipped.push({ label, reason: "no confident answer available" });
    }
  }

  const submitCandidates = page.locator(
    'form button[type="submit"], form input[type="submit"], button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Register"), button:has-text("Apply")'
  );
  const hasSubmit = (await submitCandidates.count()) > 0;

  return { filled, skipped, submitLocator: hasSubmit ? submitCandidates.first() : null };
}

function fillFormForPlatform(page, platform, applicantDetails, overrideMap) {
  if (platform === "google_forms") return fillGoogleForm(page, applicantDetails, overrideMap);
  if (platform === "luma") return fillLumaForm(page, applicantDetails, overrideMap);
  return fillGenericForm(page, applicantDetails, overrideMap);
}

// Top-level entry point: opens the real registration URL in headless
// Chromium, fills what it confidently can, and only submits if every field
// discovered on the page was filled (no skipped fields) — per the "only
// auto-submit when fully confident" rule. Otherwise leaves the browser
// filled-but-unsubmitted state behind as a screenshot for the user to
// finish manually; nothing is ever submitted with a guessed/invented value.
async function attemptAutoFill(url, applicantDetails) {
  const platform = detectPlatform(url);
  if (platform === "unknown") {
    return { platform, automated: false, reason: "Not a valid URL." };
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const { filled, skipped, submitLocator } = await fillFormForPlatform(page, platform, applicantDetails);

    console.log(`[form-filler] ${platform} — filled ${filled.length}, skipped ${skipped.length}`);

    if (filled.length === 0) {
      return { platform, automated: false, reason: "No fillable fields found on the real page.", filled, skipped };
    }

    const screenshotBuffer = await page.screenshot();

    if (skipped.length === 0 && submitLocator) {
      await submitLocator.click();
      await page.waitForTimeout(1500);
      console.log(`[form-filler] ${platform} — all fields confidently filled, submitted.`);
      return { platform, automated: true, submitted: true, filled, skipped };
    }

    return {
      platform,
      automated: true,
      submitted: false,
      filled,
      skipped,
      note: "Not all fields could be confidently filled — stopped before submitting. Complete manually.",
      screenshot: screenshotBuffer.toString("base64"),
    };
  } finally {
    await browser.close();
  }
}

// Fills a real form and stops — never clicks submit, always returns a
// screenshot, regardless of how many fields were confidently filled. Used
// by the "paste a link, review, then press Submit yourself" flow, where
// the human is the approval gate instead of the "all fields confident"
// auto-rule.
async function fillOnly(url, applicantDetails) {
  const platform = detectPlatform(url);
  if (platform === "unknown") {
    return { platform, ok: false, reason: "Not a valid URL." };
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const { filled, skipped } = await fillFormForPlatform(page, platform, applicantDetails);

    console.log(`[form-filler] preview-fill ${platform} — filled ${filled.length}, skipped ${skipped.length}`);
    const screenshotBuffer = await page.screenshot();
    return { platform, ok: filled.length > 0, filled, skipped, screenshot: screenshotBuffer.toString("base64") };
  } finally {
    await browser.close();
  }
}

// Re-opens the real form and re-fills it using the EXACT values the user
// already reviewed (via overrideMap — no new Groq calls, no chance of a
// different answer sneaking in), then clicks the real submit button. This
// is the only place a user-initiated (as opposed to auto-confidence-gated)
// submission happens, and it only runs when the user explicitly presses
// Submit on the reviewed preview.
async function submitFilledForm(url, applicantDetails, reviewedFields) {
  const platform = detectPlatform(url);
  const overrideMap = {};
  for (const f of reviewedFields) overrideMap[f.label] = f.value;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const { submitLocator } = await fillFormForPlatform(page, platform, applicantDetails, overrideMap);

    if (!submitLocator) throw new Error("Could not locate a submit button on the real page.");
    await submitLocator.click();
    await page.waitForTimeout(1500);
    console.log(`[form-filler] user-approved submit — ${platform} — submitted.`);
    return { platform, submitted: true };
  } finally {
    await browser.close();
  }
}

module.exports = { attemptAutoFill, fillOnly, submitFilledForm, detectPlatform };
