// Score storage. Two backends, picked by environment:
//  - Redis over REST (Upstash / Vercel KV) when UPSTASH_REDIS_REST_URL or KV_REST_API_URL is set.
//    Needed on serverless hosts like Vercel, which have no persistent disk. Upstash's free tier is plenty.
//  - A JSON file (data/scores.json, or $SCORES_DIR/scores.json) everywhere else.
//
// Shape: one record per (date, guild) → { [userId]: { username, avatar, rounds, total, finished } }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function redisStore(url, token) {
  async function cmd(...args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Redis: ${data.error}`);
    return data.result;
  }
  const key = (date, guild) => `maptap:scores:${date}:${guild}`;
  const metaKey = (guild, name) => `maptap:meta:${guild}:${name}`;
  return {
    kind: 'redis',
    // small per-guild settings that must outlive the 90-day score window (weekly role id, holders…)
    async getMeta(guild, name) {
      const raw = await cmd('GET', metaKey(guild, name));
      return raw ? JSON.parse(raw) : null;
    },
    async setMeta(guild, name, obj) { await cmd('SET', metaKey(guild, name), JSON.stringify(obj)); },
    async getGuild(date, guild) {
      const raw = await cmd('GET', key(date, guild));
      return raw ? JSON.parse(raw) : {};
    },
    async setGuild(date, guild, obj) {
      // keep 90 days of history
      await cmd('SET', key(date, guild), JSON.stringify(obj), 'EX', 90 * 86400);
    },
  };
}

function fileStore() {
  const dir = process.env.SCORES_DIR || path.join(__dirname, '../data');
  const file = path.join(dir, 'scores.json');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const scores = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return {
    kind: 'file',
    async getMeta(guild, name) { return scores._meta?.[guild]?.[name] ?? null; },
    async setMeta(guild, name, obj) {
      scores._meta ??= {};
      scores._meta[guild] ??= {};
      scores._meta[guild][name] = obj;
      writeFileSync(file, JSON.stringify(scores, null, 2));
    },
    async getGuild(date, guild) { return scores[date]?.[guild] || {}; },
    async setGuild(date, guild, obj) {
      scores[date] ??= {};
      scores[date][guild] = obj;
      writeFileSync(file, JSON.stringify(scores, null, 2));
    },
  };
}

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const store = url && token ? redisStore(url, token) : fileStore();
