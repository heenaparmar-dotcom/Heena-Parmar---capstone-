const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    google_refresh_token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    locations_json TEXT NOT NULL DEFAULT '[]',
    interests_json TEXT NOT NULL DEFAULT '[]',
    event_types_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS applicant_details (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    full_name TEXT,
    phone TEXT,
    college TEXT,
    course TEXT,
    year TEXT,
    portfolio_url TEXT,
    extra_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    event_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    fields_json TEXT NOT NULL DEFAULT '{}',
    calendar_event_id TEXT,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked_at TEXT
  );
`);

const applicationColumns = db.prepare("PRAGMA table_info(applications)").all().map((c) => c.name);
if (!applicationColumns.includes("note")) {
  db.exec("ALTER TABLE applications ADD COLUMN note TEXT");
}

function upsertUser({ email, name, refreshToken }) {
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) {
    if (refreshToken) {
      db.prepare("UPDATE users SET name = ?, google_refresh_token = ? WHERE id = ?").run(name, refreshToken, existing.id);
    } else {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, existing.id);
    }
    return db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
  }
  const info = db
    .prepare("INSERT INTO users (email, name, google_refresh_token) VALUES (?, ?, ?)")
    .run(email, name, refreshToken || null);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
}

function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function getPreferences(userId) {
  const row = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(userId);
  if (!row) return null;
  return {
    locations: JSON.parse(row.locations_json),
    interests: JSON.parse(row.interests_json),
    eventTypes: JSON.parse(row.event_types_json),
  };
}

function savePreferences(userId, { locations = [], interests = [], eventTypes = [] }) {
  db.prepare(
    `INSERT INTO preferences (user_id, locations_json, interests_json, event_types_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET locations_json=excluded.locations_json,
       interests_json=excluded.interests_json, event_types_json=excluded.event_types_json`
  ).run(userId, JSON.stringify(locations), JSON.stringify(interests), JSON.stringify(eventTypes));
}

function getApplicantDetails(userId) {
  const row = db.prepare("SELECT * FROM applicant_details WHERE user_id = ?").get(userId);
  if (!row) return null;
  return {
    fullName: row.full_name,
    phone: row.phone,
    college: row.college,
    course: row.course,
    year: row.year,
    portfolioUrl: row.portfolio_url,
    extra: JSON.parse(row.extra_json),
  };
}

function saveApplicantDetails(userId, { fullName, phone, college, course, year, portfolioUrl, extra = {} }) {
  db.prepare(
    `INSERT INTO applicant_details (user_id, full_name, phone, college, course, year, portfolio_url, extra_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name, phone=excluded.phone,
       college=excluded.college, course=excluded.course, year=excluded.year,
       portfolio_url=excluded.portfolio_url, extra_json=excluded.extra_json`
  ).run(userId, fullName || null, phone || null, college || null, course || null, year || null, portfolioUrl || null, JSON.stringify(extra));
}

function hasCompletedOnboarding(userId) {
  return Boolean(getApplicantDetails(userId));
}

function createApplication(userId, event, fields, status = "pending", note = null) {
  const info = db
    .prepare("INSERT INTO applications (user_id, event_json, status, fields_json, note) VALUES (?, ?, ?, ?, ?)")
    .run(userId, JSON.stringify(event), status, JSON.stringify(fields), note);
  return getApplicationById(info.lastInsertRowid);
}

function getApplicationById(id) {
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  return row ? deserializeApplication(row) : null;
}

function listApplicationsForUser(userId) {
  return db.prepare("SELECT * FROM applications WHERE user_id = ? ORDER BY applied_at DESC").all(userId).map(deserializeApplication);
}

function listPendingApplications() {
  return db.prepare("SELECT * FROM applications WHERE status = 'pending'").all().map(deserializeApplication);
}

function updateApplicationStatus(id, status, { calendarEventId } = {}) {
  if (calendarEventId !== undefined) {
    db.prepare("UPDATE applications SET status = ?, calendar_event_id = ?, last_checked_at = datetime('now') WHERE id = ?").run(
      status,
      calendarEventId,
      id
    );
  } else {
    db.prepare("UPDATE applications SET status = ?, last_checked_at = datetime('now') WHERE id = ?").run(status, id);
  }
  return getApplicationById(id);
}

function deserializeApplication(row) {
  return {
    id: row.id,
    userId: row.user_id,
    event: JSON.parse(row.event_json),
    status: row.status,
    fields: JSON.parse(row.fields_json),
    calendarEventId: row.calendar_event_id,
    note: row.note,
    appliedAt: row.applied_at,
    lastCheckedAt: row.last_checked_at,
  };
}

module.exports = {
  db,
  upsertUser,
  getUserById,
  getPreferences,
  savePreferences,
  getApplicantDetails,
  saveApplicantDetails,
  hasCompletedOnboarding,
  createApplication,
  getApplicationById,
  listApplicationsForUser,
  listPendingApplications,
  updateApplicationStatus,
};
