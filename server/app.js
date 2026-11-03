// The Express app. server/index.js listens on a port (local dev, Railway, a VPS);
// api/index.js exports it as a Vercel serverless function.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import {
  ROUNDS, MULTIPLIERS, TIER_LABELS, MAX_TOTAL, todayKey, shiftDate, puzzleNumber, dailyPlaces,
  distanceKm, scoreForDistance, medalForScore, quipFor,
} from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const { VITE_DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } = process.env;

// ---------- Discord auth ----------
// Verifies the Discord access token and returns the user. Cached per token (per process).
const userCache = new Map();
async function discordUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer /, '');
  if (!token) return null;
  // Local browser testing without Discord (see .env.example). Never enabled in production.
  if (token === 'dev' && process.env.DEV_FAKE_USER && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    return { id: 'dev-user', username: 'DevTester', global_name: 'Dev Tester', avatar: null };
  }
  if (userCache.has(token)) return userCache.get(token);
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  userCache.set(token, user);
  return user;
}

// Exchanges the OAuth code from the embedded app SDK for an access token.
app.post('/api/token', async (req, res) => {
  const body = new URLSearchParams({
    client_id: VITE_DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: req.body.code,
  });
  const r = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json(data);
  res.json({ access_token: data.access_token });
});

const roundInfo = (places) => places.map((p, i) => ({ name: p.name, country: p.country, tier: TIER_LABELS[i], multiplier: MULTIPLIERS[i] }));

// ---------- Daily game ----------
// Today's puzzle: place names only. Coordinates stay server-side until a guess is submitted.
app.get('/api/daily', async (req, res) => {
  const dateKey = todayKey();
  const places = dailyPlaces(dateKey);
  const user = await discordUser(req);
  const guildId = req.query.guildId || 'solo';
  const progress = user ? (await store.getGuild(dateKey, guildId))[user.id] : null;
  res.json({
    date: dateKey,
    number: puzzleNumber(dateKey),
    maxTotal: MAX_TOTAL,
    rounds: roundInfo(places),
    // Reveal coordinates for rounds the player already finished so a reload restores the map.
    progress: progress ? {
      ...progress,
      rounds: progress.rounds.map((r, i) => ({ ...r, target: places[i] })),
    } : null,
  });
});

// Submit a guess for a round. Server computes distance and score.
app.post('/api/guess', async (req, res) => {
  const user = await discordUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in to Discord' });
  const { round, lat, lon, guildId = 'solo' } = req.body;
  if (!Number.isInteger(round) || round < 0 || round >= ROUNDS) return res.status(400).json({ error: 'Bad round' });
  if (typeof lat !== 'number' || typeof lon !== 'number') return res.status(400).json({ error: 'Bad coordinates' });

  const dateKey = todayKey();
  const places = dailyPlaces(dateKey);
  const guild = await store.getGuild(dateKey, guildId);
  let player = guild[user.id];
  if (!player) {
    player = guild[user.id] = {
      username: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
      rounds: [], total: 0, finished: false,
    };
  }
  if (player.rounds.length !== round) return res.status(409).json({ error: 'Out of order', progress: player });

  const target = places[round];
  const km = distanceKm(lat, lon, target.lat, target.lon);
  const base = scoreForDistance(km);
  const multiplier = MULTIPLIERS[round];
  const score = Math.round(base * multiplier);
  const entry = { lat, lon, km: Math.round(km), base, multiplier, score, emoji: medalForScore(base) };
  player.rounds.push(entry);
  player.total += score;
  player.finished = player.rounds.length === ROUNDS;
  await store.setGuild(dateKey, guildId, guild);

  res.json({ ...entry, target, quip: quipFor(km), total: player.total, finished: player.finished });
});

// ---------- Practice mode (unranked, never saved; the daily attempt can't be replayed) ----------
app.get('/api/practice', (req, res) => {
  const seed = `practice:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  res.json({ seed, maxTotal: MAX_TOTAL, rounds: roundInfo(dailyPlaces(seed)) });
});

app.post('/api/practice/guess', (req, res) => {
  const { seed, round, lat, lon } = req.body;
  if (typeof seed !== 'string' || !seed.startsWith('practice:')) return res.status(400).json({ error: 'Bad seed' });
  if (!Number.isInteger(round) || round < 0 || round >= ROUNDS) return res.status(400).json({ error: 'Bad round' });
  if (typeof lat !== 'number' || typeof lon !== 'number') return res.status(400).json({ error: 'Bad coordinates' });
  const target = dailyPlaces(seed)[round];
  const km = distanceKm(lat, lon, target.lat, target.lon);
  const base = scoreForDistance(km);
  const multiplier = MULTIPLIERS[round];
  res.json({ km: Math.round(km), base, multiplier, score: Math.round(base * multiplier), emoji: medalForScore(base), target, quip: quipFor(km) });
});

// Per-server leaderboard for today.
app.get('/api/leaderboard', async (req, res) => {
  const dateKey = todayKey();
  const guildId = req.query.guildId || 'solo';
  const guild = await store.getGuild(dateKey, guildId);
  const board = Object.entries(guild)
    .map(([userId, p]) => ({ userId, username: p.username, avatar: p.avatar, total: p.total, finished: p.finished, emojis: p.rounds.map((r) => `${r.base}${r.emoji}`).join(' ') }))
    .sort((a, b) => b.total - a.total);
  res.json({ date: dateKey, number: puzzleNumber(dateKey), maxTotal: MAX_TOTAL, board });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, store: store.kind }));

// ---------- Daily streak reminder (Vercel cron → see vercel.json) ----------
// Pings everyone who has finished the puzzle on at least the last 2 consecutive days but hasn't
// played today yet. Needs a bot user on the app (DISCORD_BOT_TOKEN) with Send Messages in the
// channel, plus REMINDER_GUILD_ID / REMINDER_CHANNEL_ID and CRON_SECRET (Vercel sends it as a
// bearer token so nobody else can trigger the post).
app.get('/api/cron/reminder', async (req, res) => {
  const { CRON_SECRET, DISCORD_BOT_TOKEN, REMINDER_GUILD_ID, REMINDER_CHANNEL_ID } = process.env;
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  if (!DISCORD_BOT_TOKEN || !REMINDER_GUILD_ID || !REMINDER_CHANNEL_ID) return res.status(500).json({ error: 'Reminder env vars not set' });

  const today = todayKey();
  const playedToday = await store.getGuild(today, REMINDER_GUILD_ID);
  const days = [];
  for (let i = 1; i <= 30; i++) days.push(await store.getGuild(shiftDate(today, i), REMINDER_GUILD_ID));

  // streak = consecutive finished days ending yesterday
  const streaks = [];
  for (const userId of Object.keys(days[0])) {
    if (playedToday[userId]?.finished) continue;
    let streak = 0;
    for (const day of days) { if (day[userId]?.finished) streak++; else break; }
    if (streak >= 2) streaks.push({ userId, streak, username: days[0][userId].username });
  }
  streaks.sort((a, b) => b.streak - a.streak);
  if (req.query.dry) return res.json({ ok: true, dryRun: true, streaks }); // preview without posting
  if (!streaks.length) return res.json({ ok: true, pinged: 0 });

  const n = puzzleNumber(today);
  const list = streaks.map((s) => `<@${s.userId}> (${s.streak} day${s.streak === 1 ? '' : 's'} 🔥)`).join(', ');
  const content = `🌍 **MapTap #${n}** is live! Don't break your streak: ${list}\nType \`/maptap\` to play.`;
  const r = await fetch(`https://discord.com/api/v10/channels/${REMINDER_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { users: streaks.map((s) => s.userId) } }),
  });
  if (!r.ok) return res.status(502).json({ error: 'Discord rejected the message', detail: await r.text() });
  res.json({ ok: true, pinged: streaks.length });
});

// ---------- Static client (production on a normal Node host; Vercel serves client/dist itself) ----------
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const dist = path.join(__dirname, '../client/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export default app;
