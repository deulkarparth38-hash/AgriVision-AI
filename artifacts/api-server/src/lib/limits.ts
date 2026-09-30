import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});

export const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI requests are temporarily limited. Try again shortly." },
});