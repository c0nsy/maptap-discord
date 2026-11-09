// The Express app. server/index.js listens on a port (local dev, Railway, a VPS);
// api/index.js exports it as a Vercel serverless function.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
import {
  ROUNDS, MULTIPLIERS, TIER_LABELS, MAX_TOTAL, ROUND_SECONDS, todayKey, shiftDate, puzzleNumber, dailyPlaces,
  distanceKm, scoreForDistance, medalForScore, quipFor,
} from './game.js';

const GRACE_MS = 3000; // network slack on top of ROUND_SECONDS before a guess counts as late

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
    roundSeconds: ROUND_SECONDS,
    rounds: roundInfo(places),
    // Reveal coordinates for rounds the player already finished so a reload restores the map.
    progress: progress ? {
      ...progress,
      rounds: progress.rounds.map((r, i) => ({ ...r, target: places[i] })),
    } : null,
  });
});

function newPlayer(user) {
  return {
    username: user.global_name || user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
    rounds: [], started: {}, total: 0, finished: false,
  };
}

// The client calls this when a round's prompt appears; the clock for that round starts now
// (server time, so reloading or stalling the page doesn't buy extra seconds).
app.post('/api/round/start', async (req, res) => {
  const user = await discordUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in to Discord' });
  const { round, guildId = 'solo' } = req.body;
  if (!Number.isInteger(round) || round < 0 || round >= ROUNDS) return res.status(400).json({ error: 'Bad round' });
  const dateKey = todayKey();
  const guild = await store.getGuild(dateKey, guildId);
  const player = guild[user.id] ??= newPlayer(user);
  player.started ??= {};
  if (player.rounds.length !== round) return res.status(409).json({ error: 'Out of order', progress: player });
  if (!player.started[round]) {
    player.started[round] = Date.now();
    await store.setGuild(dateKey, guildId, guild);
  }
  const remainingMs = Math.max(0, player.started[round] + ROUND_SECONDS * 1000 - Date.now());
  res.json({ seconds: ROUND_SECONDS, remainingMs });
});

// Submit a guess for a round. Server computes distance and score.
app.post('/api/guess', async (req, res) => {
  const user = await discordUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in to Discord' });
  const { round, lat, lon, timeout, guildId = 'solo' } = req.body;
  if (!Number.isInteger(round) || round < 0 || round >= ROUNDS) return res.status(400).json({ error: 'Bad round' });
  const hasCoords = typeof lat === 'number' && typeof lon === 'number';
  if (!timeout && !hasCoords) return res.status(400).json({ error: 'Bad coordinates' });

  const dateKey = todayKey();
  const places = dailyPlaces(dateKey);
  const guild = await store.getGuild(dateKey, guildId);
  const player = guild[user.id] ??= newPlayer(user);
  if (player.rounds.length !== round) return res.status(409).json({ error: 'Out of order', progress: player });

  // Late (or never started) guesses score 0, same as an explicit timeout.
  const startedAt = player.started?.[round];
  const late = !startedAt || Date.now() - startedAt > ROUND_SECONDS * 1000 + GRACE_MS;
  const timedOut = Boolean(timeout) || late || !hasCoords;

  const target = places[round];
  const km = timedOut ? null : Math.round(distanceKm(lat, lon, target.lat, target.lon));
  const base = scoreForDistance(km);
  const multiplier = MULTIPLIERS[round];
  const score = Math.round(base * multiplier);
  const entry = { lat: timedOut ? null : lat, lon: timedOut ? null : lon, km, base, multiplier, score, timedOut, emoji: medalForScore(base, timedOut) };
  player.rounds.push(entry);
  player.total += score;
  player.finished = player.rounds.length === ROUNDS;
  await store.setGuild(dateKey, guildId, guild);

  res.json({ ...entry, target, quip: quipFor(km), total: player.total, finished: player.finished });
});

// ---------- Practice mode (unranked, never saved; the daily attempt can't be replayed) ----------
app.get('/api/practice', (req, res) => {
  const seed = `practice:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  res.json({ seed, maxTotal: MAX_TOTAL, roundSeconds: ROUND_SECONDS, rounds: roundInfo(dailyPlaces(seed)) });
});

app.post('/api/practice/guess', (req, res) => {
  const { seed, round, lat, lon, timeout } = req.body;
  if (typeof seed !== 'string' || !seed.startsWith('practice:')) return res.status(400).json({ error: 'Bad seed' });
  if (!Number.isInteger(round) || round < 0 || round >= ROUNDS) return res.status(400).json({ error: 'Bad round' });
  const timedOut = Boolean(timeout) || typeof lat !== 'number' || typeof lon !== 'number';
  const target = dailyPlaces(seed)[round];
  const km = timedOut ? null : Math.round(distanceKm(lat, lon, target.lat, target.lon));
  const base = scoreForDistance(km);
  const multiplier = MULTIPLIERS[round];
  res.json({ km, base, multiplier, score: Math.round(base * multiplier), timedOut, emoji: medalForScore(base, timedOut), target, quip: quipFor(km) });
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
  const { CRON_SECRET, DISCORD_BOT_TOKEN, REMINDER_GUILD_ID, REMINDER_CHANNEL_ID } = envTrimmed();
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

// ---------- Weekly "MapTap God" role (Vercel cron, Mondays → see vercel.json) ----------
// Sums every finished daily total over the last full Monday–Sunday week (UTC). The player with the
// highest weekly total gets the MapTap God role (created on first run if WEEKLY_ROLE_ID isn't set:
// gold, hoisted) and last week's holder loses it. Needs the bot to have Manage Roles and its own
// role above MapTap God in the server's role list.
// env values pasted into dashboards sometimes carry a trailing space
const envTrimmed = () => Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
const WEEKLY_ROLE_NAME = 'MapTap God';
const WEEKLY_ROLE_COLOR = 0xffd700; // gold

function lastFullWeek(today = todayKey()) {
  // Monday–Sunday block that ended most recently (yesterday if today is Monday)
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const daysSinceSunday = dow === 0 ? 7 : dow;             // today Monday → Sunday was 1 day ago
  const end = shiftDate(today, daysSinceSunday);
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(shiftDate(end, i));
  return { start: days[0], end, days };
}

async function discordBot(method, path, body) {
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Discord ${method} ${path} → ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

app.get('/api/cron/weekly', async (req, res) => {
  const { CRON_SECRET, DISCORD_BOT_TOKEN, REMINDER_GUILD_ID, REMINDER_CHANNEL_ID } = envTrimmed();
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  if (!DISCORD_BOT_TOKEN || !REMINDER_GUILD_ID || !REMINDER_CHANNEL_ID) return res.status(500).json({ error: 'Reminder env vars not set' });
  const guild = REMINDER_GUILD_ID;

  const week = lastFullWeek(typeof req.query.today === 'string' ? req.query.today : undefined);
  const totals = {};
  for (const date of week.days) {
    const day = await store.getGuild(date, guild);
    for (const [userId, p] of Object.entries(day)) {
      if (!p.finished) continue;
      totals[userId] ??= { userId, username: p.username, total: 0, days: 0 };
      totals[userId].total += p.total;
      totals[userId].days += 1;
      totals[userId].username = p.username;
    }
  }
  const ranking = Object.values(totals).sort((a, b) => b.total - a.total || b.days - a.days);
  const winners = ranking.filter((p) => p.total === ranking[0]?.total); // ties share it
  const prev = (await store.getMeta(guild, 'weekly')) || {};
  if (req.query.dry) return res.json({ ok: true, dryRun: true, week, ranking, winners: winners.map((w) => w.userId), previous: prev });

  try {
    // Role: env override → remembered → existing by name → create. Every run also re-applies the
    // colour/hoist and moves the role to just under the bot's own role, so it sits above the
    // members' other coloured roles and the gold name actually shows. (A bot can only place roles
    // below its own, so the bot's role itself must be dragged up by a server admin.)
    let roleId = process.env.WEEKLY_ROLE_ID || prev.roleId;
    const roles = await discordBot('GET', `/guilds/${guild}/roles`);
    let role = roles.find((r) => r.id === roleId) || roles.find((r) => r.name === WEEKLY_ROLE_NAME);
    if (!role) role = await discordBot('POST', `/guilds/${guild}/roles`, { name: WEEKLY_ROLE_NAME, color: WEEKLY_ROLE_COLOR, hoist: true, mentionable: false });
    roleId = role.id;
    if (!process.env.WEEKLY_ROLE_ID && (role.color !== WEEKLY_ROLE_COLOR || !role.hoist)) {
      await discordBot('PATCH', `/guilds/${guild}/roles/${roleId}`, { color: WEEKLY_ROLE_COLOR, hoist: true });
    }
    // The bot can place roles anywhere below its own highest role: look that up from its member record.
    const me = await discordBot('GET', '/users/@me');
    const botMember = await discordBot('GET', `/guilds/${guild}/members/${me.id}`).catch(() => null);
    const botTop = Math.max(0, ...roles.filter((r) => botMember?.roles?.includes(r.id)).map((r) => r.position));
    console.log('[weekly] role', roleId, 'pos', role.position, 'bot top pos', botTop, 'bot roles', botMember?.roles);
    if (botTop > 1 && role.position !== botTop - 1) {
      await discordBot('PATCH', `/guilds/${guild}/roles`, [{ id: roleId, position: botTop - 1 }])
        .then(() => console.log('[weekly] moved role to', botTop - 1))
        .catch((e) => console.log('[weekly] could not move role:', e.message));
    }
    if (prev.week === week.end && !req.query.force) return res.json({ ok: true, skipped: 'already awarded', week, roleId });
    if (!winners.length) return res.json({ ok: true, week, winners: 0 });

    const winnerIds = winners.map((w) => w.userId);
    for (const userId of prev.holders || []) {
      if (winnerIds.includes(userId)) continue;
      await discordBot('DELETE', `/guilds/${guild}/members/${userId}/roles/${roleId}`).catch(() => {}); // e.g. left the server
    }
    for (const userId of winnerIds) await discordBot('PUT', `/guilds/${guild}/members/${userId}/roles/${roleId}`);
    await store.setMeta(guild, 'weekly', { roleId, holders: winnerIds, week: week.end });

    const pts = (p) => `**${p.total.toLocaleString('en-US')}** pts over ${p.days} day${p.days === 1 ? '' : 's'}`;
    const nice = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
    const lines = [
      `👑 **MapTap God of the week** (${nice(week.start)} – ${nice(week.end)})`,
      `All hail ${winners.map((p) => `<@${p.userId}>`).join(' and ')} — ${pts(winners[0])}! The golden crown is yours for the week.`,
      '', 'A new week starts now. Good luck everyone — the crown is up for grabs again next Monday. Play daily with `/maptap`.',
    ];
    await discordBot('POST', `/channels/${REMINDER_CHANNEL_ID}/messages`, {
      content: lines.join('\n'),
      allowed_mentions: { users: winnerIds },
    });
    res.json({ ok: true, week, roleId, winners: winnerIds, removed: (prev.holders || []).filter((u) => !winnerIds.includes(u)) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Static client (production on a normal Node host; Vercel serves client/dist itself) ----------
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const dist = path.join(__dirname, '../client/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export default app;
