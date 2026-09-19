const { google } = require("googleapis");
const db = require("../db");

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth is not configured (missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).");
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

async function handleCallback(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  if (!profile.email) throw new Error("Google did not return an email address for this account.");

  const user = db.upsertUser({
    email: profile.email,
    name: profile.name || profile.email,
    refreshToken: tokens.refresh_token || null,
  });
  return user;
}

// Builds an authenticated client for a given user's stored refresh token —
// created per request, never cached globally, since each user has their own.
function getClientForUser(user) {
  if (!user.google_refresh_token) {
    throw new Error(`No Google refresh token stored for ${user.email} — they must re-consent (offline access).`);
  }
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: user.google_refresh_token });
  return client;
}

module.exports = { getAuthUrl, handleCallback, getClientForUser, SCOPES };
