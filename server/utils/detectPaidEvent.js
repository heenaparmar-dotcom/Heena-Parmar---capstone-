// Deterministic (no AI) detection of whether a registration page is for a
// paid event. This matters because the agent never touches a payment
// form — auto-applying to something that turns out to require payment
// would silently fail or worse, so paid events are always routed to
// "complete manually" rather than attempted.
const CURRENCY_AMOUNT = /(₹|rs\.?\s|inr\s|\$)\s?\d/i;
const PAID_WORDS = /\b(ticket price|registration fee|entry fee|paid event|buy ticket|price:\s*(₹|rs|inr|\$)?\s?\d)/i;
const FREE_WORDS = /\b(free (event|entry|registration|admission|ticket)|no cost|no fee|complimentary)\b/i;

function isPaidEvent(pageText) {
  if (!pageText) return false; // unknown -> don't block; downstream still gates on confident fill
  if (FREE_WORDS.test(pageText) && !CURRENCY_AMOUNT.test(pageText)) return false;
  return CURRENCY_AMOUNT.test(pageText) || PAID_WORDS.test(pageText);
}

module.exports = { isPaidEvent };
