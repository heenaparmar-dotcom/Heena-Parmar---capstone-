const db = require("../db");

module.exports = function requireAuth(req, res, next) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not logged in." });
  }
  const user = db.getUserById(userId);
  if (!user) {
    return res.status(401).json({ error: "Session refers to a user that no longer exists." });
  }
  req.user = user;
  next();
};
