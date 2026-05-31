const JWT = require("jsonwebtoken");
require("dotenv").config();

const SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

/**
 * Create an access token with minimal payload (no PII).
 */
function createTokenForUser(user) {
  const payload = {
    AccNumber: user.accountNumber,
    role: user.role || "user",
  };
  return JWT.sign(payload, SECRET, { expiresIn: process.env.JWT_EXPIRY || "1h" });
}

/**
 * Create a refresh token for session renewal.
 */
function createRefreshToken(user) {
  const payload = {
    AccNumber: user.accountNumber,
    role: user.role || "user",
    type: "refresh",
  };
  return JWT.sign(payload, REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d" });
}

/**
 * Create tokens for admin users.
 */
function createTokenForAdmin(admin) {
  const payload = {
    adminId: admin.adminId,
    username: admin.username,
    role: admin.role || "admin",
    roleName: admin.roleName || "Unknown",
  };
  return JWT.sign(payload, SECRET, { expiresIn: process.env.JWT_EXPIRY || "1h" });
}

/**
 * Verify a refresh token.
 */
function verifyRefreshToken(token) {
  return JWT.verify(token, REFRESH_SECRET);
}

module.exports = {
  createTokenForUser,
  createRefreshToken,
  createTokenForAdmin,
  verifyRefreshToken,
};
