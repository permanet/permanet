import rateLimit from 'express-rate-limit';

export const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 submissions per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded',
    message: 'Maximum 10 submissions per hour. Try again later.',
  },
});
