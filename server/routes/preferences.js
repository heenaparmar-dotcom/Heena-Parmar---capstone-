const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    preferences: db.getPreferences(req.user.id),
    applicantDetails: db.getApplicantDetails(req.user.id),
    onboarded: db.hasCompletedOnboarding(req.user.id),
  });
});

router.post("/", (req, res) => {
  const { locations, interests, eventTypes, applicantDetails } = req.body || {};
  if (locations || interests || eventTypes) {
    db.savePreferences(req.user.id, { locations, interests, eventTypes });
  }
  if (applicantDetails) {
    const existing = db.getApplicantDetails(req.user.id);
    db.saveApplicantDetails(req.user.id, {
      ...applicantDetails,
      extra: { ...(existing?.extra || {}), ...(applicantDetails.extra || {}) },
    });
  }
  res.json({
    preferences: db.getPreferences(req.user.id),
    applicantDetails: db.getApplicantDetails(req.user.id),
    onboarded: db.hasCompletedOnboarding(req.user.id),
  });
});

module.exports = router;
