// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app used everywhere else.
import app from '../server/app.js';

export default app;
