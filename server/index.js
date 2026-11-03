import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import {
  ROUNDS, MULTIPLIERS, TIER_LABELS, MAX_TOTAL, todayKey, puzzleNumber, dailyPlaces,
  distanceKm, scoreForDistance, medalForScore, quipFor,
} from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const { VITE_DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } = process.env;

// ---------- Persistence (simple JSON file; swap for a DB if the server grows) ----------
const DATA_DIR = path.join(__dirname, '../data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
let scores = existsSync(SCORES_FILE) ? JSON.parse(readFileSync(SCORES_FILE, 'utf8')) : {};
function saveScores() { writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2)); }

// scores[dateKey][guildId][userId] = { username, avatar, rounds: [{km, score}], total, finished }
function getPlayer(dateKey, guildId, userId) {
  scores[dateKey] ??= {};
  scores[dateKey][guildId] ??= {};
  return scores[dateKey][guildId][userId];
}

// ---------- Discord auth ----------
// Verifies the Discord access token and returns the user. Cached per token.
const userCache = new Map();
async function discordUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer /, '');
  if (!token) return null;
  // Local browser testing without Discord (see .env.example). Never enabled in production.
  if (token === 'dev' && process.env.DEV_FAKE_USER && process.env.NODE_ENV !== 'production') {
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

// ---------- Game API ----------
// Today's puzzle: place names only. Coordinates stay server-side until a guess is submitted.
app.get('/api/daily', async (req, res) => {
  const dateKey = todayKey();
  const places = dailyPlaces(dateKey);
  const user = await discordUser(req);
  const guildId = req.query.guildId || 'solo';
  const progress = user ? getPlayer(dateKey, guildId, user.id) : null;
  res.json({
    date: dateKey,
    number: puzzleNumber(dateKey),
    maxTotal: MAX_TOTAL,
    rounds: places.map((p, i) => ({ name: p.name, country: p.country, tier: TIER_LABELS[i], multiplier: MULTIPLIERS[i] })),
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
  let player = getPlayer(dateKey, guildId, user.id);
  if (!player) {
    player = scores[dateKey][guildId][user.id] = {
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
  saveScores();

  res.json({ ...entry, target, quip: quipFor(km), total: player.total, finished: player.finished });
});

// ---------- Practice mode (unranked, never saved; the daily attempt can't be replayed) ----------
app.get('/api/practice', (req, res) => {
  const seed = `practice:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const places = dailyPlaces(seed);
  res.json({
    seed,
    maxTotal: MAX_TOTAL,
    rounds: places.map((p, i) => ({ name: p.name, country: p.country, tier: TIER_LABELS[i], multiplier: MULTIPLIERS[i] })),
  });
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
app.get('/api/leaderboard', (req, res) => {
  const dateKey = todayKey();
  const guildId = req.query.guildId || 'solo';
  const board = Object.entries(scores[dateKey]?.[guildId] || {})
    .map(([userId, p]) => ({ userId, username: p.username, avatar: p.avatar, total: p.total, finished: p.finished, emojis: p.rounds.map((r) => `${r.base}${r.emoji}`).join(' ') }))
    .sort((a, b) => b.total - a.total);
  res.json({ date: dateKey, number: puzzleNumber(dateKey), maxTotal: MAX_TOTAL, board });
});

// ---------- Static client (production) ----------
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../client/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`MapTap server on http://localhost:${PORT}`));
