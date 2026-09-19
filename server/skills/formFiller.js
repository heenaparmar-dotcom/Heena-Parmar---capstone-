const { chromium } = require("playwright");
const groq = require("../services/groq");

function detectPlatform(url) {
  if (!url) return "unknown";
  if (/docs\.google\.com\/forms/i.test(url)) return "google_forms";
  if (/luma\.com/i.test(url)) return "luma";
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
    [/email/, applicantDetails.email],
    [/phone|mobile/, applicantDetails.phone],
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

// Top-level entry point: opens the real registration URL in headless
// Chromium, fills what it confidently can, and only submits if every field
// discovered on the page was filled (no skipped fields) — per the "only
// auto-submit when fully confident" rule. Otherwise leaves the browser
// filled-but-unsubmitted state behind as a screenshot for the user to
// finish manually; nothing is ever submitted with a guessed/invented value.
async function attemptAutoFill(url, applicantDetails) {
  const platform = detectPlatform(url);
  if (platform === "unknown") {
    return { platform, automated: false, reason: "Not a recognized form platform (Google Forms / Luma)." };
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const { filled, skipped, submitLocator } =
      platform === "google_forms" ? await fillGoogleForm(page, applicantDetails) : await fillLumaForm(page, applicantDetails);

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
    return { platform, ok: false, reason: "Not a recognized form platform (Google Forms / Luma)." };
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const { filled, skipped } =
      platform === "google_forms" ? await fillGoogleForm(page, applicantDetails) : await fillLumaForm(page, applicantDetails);

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

    const { submitLocator } =
      platform === "google_forms"
        ? await fillGoogleForm(page, applicantDetails, overrideMap)
        : await fillLumaForm(page, applicantDetails, overrideMap);

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
