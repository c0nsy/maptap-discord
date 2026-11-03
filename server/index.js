// Long-running server entry (local dev, Railway, Render, a VPS). Vercel uses api/index.js instead.
import app from './app.js';

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MapTap server on http://localhost:${PORT}`));
