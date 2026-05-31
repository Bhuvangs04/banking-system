const rateLimit = require("express-rate-limit");

/**
 * Rate limiter for login endpoints - 5 attempts per 15 minutes.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for transfer/withdraw endpoints - 20 per hour.
 */
const transactionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Too many transactions. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API rate limiter - 200 requests per 15 minutes.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, transactionLimiter, generalLimiter };
