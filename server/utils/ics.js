// Builds a real, standards-compliant iCalendar (.ics) file for one workshop
// time block. This is the actual calendar-blocking mechanism: the user
// downloads and imports this file into Google Calendar / Outlook / Apple
// Calendar themselves, so the block is a real, verifiable calendar event —
// not a claim that Design World silently wrote to some account on the
// user's behalf (which no credential in this project actually permits).
//
// Deliberately refuses to build an event for a date/time that isn't fully
// confirmed — see workshops.js, which validates before calling this.

function pad(n) {
  return String(n).padStart(2, "0");
}

function isConfirmedDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "");
}

function isConfirmedTime(time) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time || "");
}

function toIcsDateTime(date, time) {
  const [y, m, d] = date.split("-");
  const [h, min] = time.split(":");
  return `${y}${m}${d}T${pad(h)}${pad(min)}00`;
}

function escapeIcsText(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

// Throws if date/startTime/endTime aren't fully confirmed, real values —
// this function will never silently invent or round a time.
function buildWorkshopIcs(workshop) {
  const { name, date, startTime, endTime, venue, registrationUrl } = workshop;

  if (!isConfirmedDate(date)) {
    throw new Error("Cannot create a calendar block: the workshop date isn't confirmed.");
  }
  if (!isConfirmedTime(startTime) || !isConfirmedTime(endTime)) {
    throw new Error("Cannot create a calendar block: start and end time must both be confirmed (HH:MM, 24-hour).");
  }

  const dtStart = toIcsDateTime(date, startTime);
  const dtEnd = toIcsDateTime(date, endTime);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `${dtStart}-${Math.random().toString(36).slice(2, 10)}@design-world.local`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Design World//Workshop Calendar Block//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(name)}`,
    `LOCATION:${escapeIcsText(venue)}`,
    `DESCRIPTION:${escapeIcsText(registrationUrl ? `Registration: ${registrationUrl}` : "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

module.exports = { buildWorkshopIcs, isConfirmedDate, isConfirmedTime };
