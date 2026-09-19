const db = require("../db");
const groq = require("../services/groq");
const gmail = require("../services/gmail");
const { deleteCalendarEvent } = require("../services/googleCalendar");

// Checks every pending application's linked user's real Gmail inbox for a
// reply, classifies it with Groq, and reconciles status/calendar. Logged
// per-application so a run is observable, not a silent black box. Never
// marks an application approved/rejected without a real classified email.
async function checkApplications() {
  const pending = db.listPendingApplications();
  console.log(`[cron] checking ${pending.length} pending application(s)`);
  let changed = 0;

  for (const app of pending) {
    const user = db.getUserById(app.userId);
    try {
      const replies = await gmail.findRepliesAboutEvent(user, app.event.name);
      if (replies.length === 0) {
        console.log(`[cron] app ${app.id} ("${app.event.name}") — no new email found`);
        db.updateApplicationStatus(app.id, "pending");
        continue;
      }

      for (const reply of replies) {
        const { classification, reason } = await groq.classifyEmailReply(reply.text, app.event.name);
        if (classification === "approved") {
          db.updateApplicationStatus(app.id, "approved");
          console.log(`[cron] app ${app.id} approved — "${reason}"`);
          changed++;
          break;
        }
        if (classification === "rejected") {
          db.updateApplicationStatus(app.id, "rejected");
          if (app.calendarEventId) {
            await deleteCalendarEvent(user, app.calendarEventId);
            console.log(`[cron] app ${app.id} rejected — removed calendar event ${app.calendarEventId}`);
          }
          changed++;
          break;
        }
      }
    } catch (err) {
      console.error(`[cron] app ${app.id} check failed: ${err.message}`);
    }
  }

  console.log(`[cron] run complete — ${changed} status change(s)`);
  return { checked: pending.length, changed };
}

module.exports = { checkApplications };
