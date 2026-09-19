const { google } = require("googleapis");
const { getClientForUser } = require("../auth/google");

// Creates a real Calendar event on the user's primary calendar for a
// workshop/event with a confirmed date+time. Returns the real Calendar
// event id (needed later to delete it on rejection). Throws if date/time
// aren't confirmed — never guesses a slot.
async function blockCalendarForEvent(user, event) {
  if (!event.date || !event.startTime || !event.endTime) {
    throw new Error(`Cannot block calendar for "${event.name}" — date/time not confirmed.`);
  }
  const auth = getClientForUser(user);
  const calendar = google.calendar({ version: "v3", auth });

  const { data } = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.name,
      location: event.venue || undefined,
      description: `Applied via Design World agent.${event.registrationUrl ? `\nRegistration: ${event.registrationUrl}` : ""}`,
      start: { dateTime: `${event.date}T${event.startTime}:00`, timeZone: "Asia/Kolkata" },
      end: { dateTime: `${event.date}T${event.endTime}:00`, timeZone: "Asia/Kolkata" },
    },
  });
  return data.id;
}

async function deleteCalendarEvent(user, calendarEventId) {
  if (!calendarEventId) return;
  const auth = getClientForUser(user);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId: calendarEventId });
}

module.exports = { blockCalendarForEvent, deleteCalendarEvent };
