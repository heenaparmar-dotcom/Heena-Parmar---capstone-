const { google } = require("googleapis");
const { getClientForUser } = require("../auth/google");

// Searches the user's real Gmail inbox for messages newer than 1 day whose
// subject/body might mention the given event name. Returns real message
// bodies (decoded), or [] if none found — never fabricates a message.
async function findRepliesAboutEvent(user, eventName) {
  const auth = getClientForUser(user);
  const gmail = google.gmail({ version: "v1", auth });

  const searchTerm = eventName.split(" ").slice(0, 4).join(" ");
  const { data } = await gmail.users.messages.list({
    userId: "me",
    q: `newer_than:2d "${searchTerm}"`,
    maxResults: 5,
  });

  if (!data.messages || data.messages.length === 0) return [];

  const bodies = [];
  for (const msg of data.messages) {
    const { data: full } = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
    bodies.push({ id: msg.id, text: extractPlainText(full) });
  }
  return bodies;
}

function extractPlainText(message) {
  const parts = message.payload?.parts || [message.payload];
  for (const part of parts) {
    if (part && part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
  }
  return message.snippet || "";
}

// Sends a real confirmation email from the user's own Gmail account to
// themselves, only ever called after a genuine automated submission
// actually succeeded (never for a "needs manual action" result) — so this
// email is itself evidence of a real action, not a notification about a
// fabricated one.
async function sendApplicationConfirmation(user, event) {
  const auth = getClientForUser(user);
  const gmail = google.gmail({ version: "v1", auth });

  const subject = `Applied: ${event.name}`;
  const body =
    `Design World's agent just submitted your registration for "${event.name}".\n\n` +
    `${event.url ? `Registration link: ${event.url}\n` : ""}` +
    `You'll get another email from Design World if the organizer's own reply is detected and classified as approved or rejected.`;

  const raw = Buffer.from(
    `To: ${user.email}\r\n` + `Subject: ${subject}\r\n` + `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` + body
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

module.exports = { findRepliesAboutEvent, sendApplicationConfirmation };
