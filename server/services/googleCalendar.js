const { google } = require("googleapis");
const { getClientForUser } = require("../auth/google");

// Creates a real Calendar event on the user's primary calendar for a
// workshop/event. Requires a confirmed real date — never guesses one.
// If a confirmed start/end time is also known, creates a timed event;
// otherwise creates an honest all-day event for that date rather than
// inventing a time slot.
async function blockCalendarForEvent(user, event) {
  if (!event.date) {
    throw new Error(`Cannot block calendar for "${event.name}" — date not confirmed.`);
  }
  const auth = getClientForUser(user);
  const calendar = google.calendar({ version: "v3", auth });

  const requestBody = {
    summary: event.name,
    location: event.venue || undefined,
    description: `Added via Design World agent.${event.url ? `\nSource: ${event.url}` : ""}`,
  };

  if (event.startTime && event.endTime) {
    requestBody.start = { dateTime: `${event.date}T${event.startTime}:00`, timeZone: "Asia/Kolkata" };
    requestBody.end = { dateTime: `${event.date}T${event.endTime}:00`, timeZone: "Asia/Kolkata" };
  } else {
    requestBody.start = { date: event.date };
    requestBody.end = { date: nextDay(event.date) };
  }

  const { data } = await calendar.events.insert({ calendarId: "primary", requestBody });
  return data.id;
}

function nextDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function deleteCalendarEvent(user, calendarEventId) {
  if (!calendarEventId) return;
  const auth = getClientForUser(user);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId: calendarEventId });
}

module.exports = { blockCalendarForEvent, deleteCalendarEvent };
