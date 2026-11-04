// Shared game logic: daily puzzle selection, distance and scoring.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PLACES = JSON.parse(readFileSync(path.join(__dirname, '../data/places.json'), 'utf8'));

export const ROUNDS = 5;
export const MAX_ROUND_SCORE = 100;
// Round i uses places of difficulty i+1 and multiplies the base score by MULTIPLIERS[i].
export const MULTIPLIERS = [1, 1.5, 2, 2.5, 3]; // perfect day = 1000
export const TIER_LABELS = ['Easy', 'Medium', 'Hard', 'Expert', 'Extreme'];
// Which place-difficulty pool each round draws from. Tier 1 (world-famous capitals) is skipped
// entirely so even the "Easy" round is a secondary city; the last two rounds both draw from tier 5.
export const ROUND_TIERS = [2, 3, 4, 5, 5];
export const ROUND_SECONDS = 20; // time limit per round; the server allows a little network grace
export const MAX_TOTAL = MULTIPLIERS.reduce((s, m) => s + m * MAX_ROUND_SCORE, 0);
// Puzzle #1 is this date; the number increments each UTC day after.
const EPOCH = Date.UTC(2026, 10, 3); // 2026-11-03

/** Today's date key in UTC, e.g. "2026-11-03". */
export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Date key `days` days before another date key. */
export function shiftDate(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

export function puzzleNumber(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1;
}

// Small deterministic PRNG so every server (and every player) gets the same 5 places per day.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The 5 places for a given date key: one per difficulty tier, easiest first. */
export function dailyPlaces(dateKey) {
  const rand = mulberry32(hashString('maptap:' + dateKey));
  const picked = [];
  for (const t of ROUND_TIERS) {
    const tier = PLACES.filter((p) => (p.difficulty ?? 3) === t && !picked.includes(p));
    const pool = tier.length ? tier : PLACES;
    picked.push(pool[Math.floor(rand() * pool.length)]);
  }
  return picked;
}

/** Great-circle distance in km (haversine). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Steeper than maptap.gg's 100 × e^(−km/4600): we use 100 × e^(−km/3000), so
 * 236 km → 92, 639 km → 81, 1,500 km → 61, 3,000 km → 37, 6,589 km → 11.
 */
export function scoreForDistance(km) {
  if (km == null) return 0; // ran out of time
  return Math.max(0, Math.round(MAX_ROUND_SCORE * Math.exp(-km / 3000)));
}

/** The orange one-liner under each round's result. */
const QUIPS = [
  [25, ['Better than a GPS', 'Pinpoint. Suspiciously pinpoint.', 'Did you grow up there?', 'Bullseye.']],
  [100, ['Practically a local', 'Close enough to smell the food', 'Nailed it', 'Walking distance, basically']],
  [400, ['Right neighbourhood', 'A short road trip away', 'Same postcode, roughly', 'Nice shot']],
  [1200, ['Right country, wrong exit', 'The map was upside down, right?', 'A long drive', 'In the ballpark']],
  [3000, ['Wrong country, right continent', 'That\'s a flight, not a drive', 'Geography is hard', 'Close-ish?']],
  [6000, ['Different continent, bold choice', 'Were you aiming for anything?', 'Have you heard of maps?', 'Vibes-based geography']],
  [Infinity, ['Other side of the planet', 'Wrong hemisphere entirely', 'Impressively far', 'That\'s the antipode\'s neighbour']],
];
export function quipFor(km) {
  if (km == null) return 'Too slow! The clock ran out.';
  const bucket = QUIPS.find(([max]) => km <= max)[1];
  return bucket[Math.floor(km * 7919) % bucket.length];
}

/** Medal next to each round's base score in the share text (maptap style: 100🎯 95🥇 94🥈). */
export function medalForScore(base, timedOut = false) {
  if (timedOut) return '⏰';
  if (base >= 100) return '🎯';
  if (base >= 95) return '🥇';
  if (base >= 85) return '🥈';
  if (base >= 70) return '🥉';
  if (base >= 40) return '😬';
  return '💀';
}
