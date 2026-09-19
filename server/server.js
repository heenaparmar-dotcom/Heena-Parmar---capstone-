require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieSession = require("cookie-session");
const cron = require("node-cron");

const db = require("./db");
const googleAuth = require("./auth/google");
const requireAuth = require("./middleware/requireAuth");
const mcp = require("./mcp/tavilyClient");
const { checkApplications } = require("./cron/checkApplications");

const preferencesRouter = require("./routes/preferences");
const eventsRouter = require("./routes/events");
const applicationsRouter = require("./routes/applications");
const trendsRouter = require("./routes/trends");
const talkToMeRouter = require("./routes/talktome");
const formReviewRouter = require("./routes/formReview");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.warn("[server] SESSION_SECRET is not set — using an insecure default. Set it before deploying.");
}

app.use(express.json());
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "dev-only-insecure-secret"],
    maxAge: 30 * 24 * 60 * 60 * 1000,
  })
);

// ---- Auth routes ----
app.get("/auth/google", (req, res) => {
  try {
    res.redirect(googleAuth.getAuthUrl());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const user = await googleAuth.handleCallback(req.query.code);
    req.session.userId = user.id;
    const onboarded = db.hasCompletedOnboarding(user.id);
    res.redirect(onboarded ? "/checkin.html" : "/onboarding.html");
  } catch (err) {
    console.error("[auth] callback failed:", err.message);
    res.status(500).send("Google sign-in failed: " + err.message);
  }
});

app.get("/auth/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

app.get("/api/me", (req, res) => {
  const userId = req.session && req.session.userId;
  if (!userId) return res.json({ loggedIn: false });
  const user = db.getUserById(userId);
  if (!user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, email: user.email, name: user.name, onboarded: db.hasCompletedOnboarding(user.id) });
});

// ---- Static frontend ----
app.use(express.static(path.join(__dirname, "..", "public")));

// ---- API routes (all require login) ----
app.use("/api/preferences", requireAuth, preferencesRouter);
app.use("/api/events", requireAuth, eventsRouter);
app.use("/api/applications", requireAuth, applicationsRouter);
app.use("/api/trends", requireAuth, trendsRouter);
app.use("/api/talktome", requireAuth, talkToMeRouter);
app.use("/api/form-review", requireAuth, formReviewRouter);

// ---- Health endpoint — real config booleans, never secret values ----
app.get("/api/health", async (req, res) => {
  const health = {
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    mcpConfigured: Boolean(process.env.TAVILY_API_KEY),
    mcpTools: null,
    mcpError: null,
  };
  if (health.mcpConfigured) {
    try {
      health.mcpTools = await mcp.listTools();
    } catch (err) {
      health.mcpError = err.message;
    }
  }
  res.json(health);
});

// ---- Daily cron: check Gmail for application replies ----
cron.schedule("0 8 * * *", () => {
  console.log("[cron] daily application check starting");
  checkApplications().catch((err) => console.error("[cron] run failed:", err.message));
});

// Manual trigger for testing/demo, guarded by login.
app.post("/api/cron/check-applications", requireAuth, async (req, res) => {
  try {
    const result = await checkApplications();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Design World server running at http://localhost:${PORT}`);
});
