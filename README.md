# MapTap Daily – Discord Activity

A daily geography game for your Discord server, in the style of [maptap.gg](https://maptap.gg/)
and Wordle. Every UTC day everyone gets the same 5 places. Spin the 3D globe and tap as close as
you can to each one, then share your line to chat and compare on the server leaderboard.

```
MapTap #12 November 3
95🥇 100🎯 94🥈 94🥈 100🎯
Final score: 965
```

| Medal | Base score |
|-------|------------|
| 🎯 | 100 |
| 🥇 | 95–99 |
| 🥈 | 85–94 |
| 🥉 | 70–84 |
| 😬 | 40–69 |
| 💀 | under 40 |

Base score per round is 100 × e^(−km∕3000) (steeper than maptap.gg): 236 km ≈ 92, 639 km ≈ 81,
1,500 km ≈ 61, 3,000 km ≈ 37. Rounds get harder and the base is multiplied: Easy ×1, Medium ×1.5,
Hard ×2, Expert ×2.5, Extreme ×3, so a perfect day is 1000. Each of the ~380 places in
`data/places.json` has a `difficulty` of 1–5; rounds draw from tiers 2, 3, 4, 5, 5 (`ROUND_TIERS`
in `server/game.js`), so the world-famous capitals in tier 1 never appear.

**45 seconds per round.** The clock starts when the prompt appears and is kept server-side, so
reloading doesn't reset it. No tap in time scores 0 for that round (⏰ in the share line).

Tapping the globe **is** the guess (zoom in first to be precise). The reveal copies maptap.gg: an
orange line grows from your tap to the answer while the globe turns to follow it, rods mark both
points, the answer's country lights up with a ring of your miss distance, and the result types out
(flag, name, distance, score, population, a one-liner). It auto-advances after a few seconds; tap
anywhere to skip.

One daily attempt per player: it is saved server-side and cannot be replayed or reset. After
finishing, **Play again (practice)** starts an unranked game with fresh random places that never
touches the daily score or leaderboard.

## Layout

```
client/      Vite app (vanilla JS). three.js globe with bundled NASA Blue Marble texture,
             country highlight/ring drawn from bundled Natural Earth data, SVG flags — nothing
             is fetched from outside Discord's sandbox.
server/      Express: Discord OAuth token exchange, daily puzzle, guess scoring, leaderboard.
data/        places.json (the pool of ~170 cities/landmarks) and scores.json (written at runtime).
```

Places are chosen deterministically from the date, so every server sees the same puzzle.
Coordinates never reach the client until a guess has been submitted.

## Add it to your own Discord server

You need Node 18+ and a Discord application of your own (free). One deployment can serve many
servers: the leaderboard is per server automatically. Steps 1–3 below take about ten minutes.

## 1. Create the Discord app

1. Go to https://discord.com/developers/applications → **New Application**.
2. **OAuth2** → copy the *Client ID* and *Client Secret*.
3. **Activities** → *Getting Started* → enable Activities.
4. Under **Activities → URL Mappings** add a root mapping: `/` → your public HTTPS URL
   (your tunnel URL during development, your host in production).
5. **OAuth2 → Redirects** → add `https://127.0.0.1` (a placeholder; the SDK never uses it, but
   the token exchange fails with "Missing redirect_uri" if none is registered).
6. **Installation** → make sure *Guild Install* is enabled, then install the app to your server
   with the install link on that page.
7. Optional: enabling Activities created a `/launch` slash command. Rename it to `/maptap` with
   `node scripts/rename-command.js` (reads your `.env`).

## 2. Run locally

```bash
cp .env.example .env     # fill in VITE_DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET
npm install
npm run dev              # client on :5173 (proxies /api), server on :3001
```

Open http://localhost:5173 in a normal browser to play as a fake dev user
(`DEV_FAKE_USER=1` in `.env`; the server ignores it in production).

### Testing inside Discord

Discord needs an HTTPS URL. Expose the Vite dev server with a tunnel, for example:

```bash
cloudflared tunnel --url http://localhost:5173
```

Set that `https://….trycloudflare.com` URL as the `/` URL mapping in the developer portal, and
run the dev server with `VITE_TUNNEL=1 npm run dev` so hot reload works through the tunnel.
Then in a voice channel on your server: **Activities (🚀) → your app**.

## 3. Deploy

```bash
npm run build            # builds client/dist
npm start                # serves client/dist + API on $PORT
```

Host it anywhere Node runs (Railway, Fly, Render, a VPS behind Caddy). Set
`VITE_DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, do **not** set `DEV_FAKE_USER`, and point
the URL mapping at the deployed host. Scores are a JSON file: set `SCORES_DIR` to a persistent
volume (for example `/data` on Railway) so they survive redeploys, or swap the few functions at
the top of `server/index.js` for a DB.

### Free hosting on Vercel (recommended)

Vercel's Hobby plan is free, and serverless functions have no disk, so scores go in a free
Upstash Redis database instead of the file (`server/store.js` switches automatically).

1. https://vercel.com/new → Import the GitHub repo. `vercel.json` already sets the build
   (`npm run build`), the output dir (`client/dist`) and routes `/api/*` to `api/index.js`.
2. Environment Variables: `VITE_DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
3. Storage tab → Create → Upstash Redis (free) → connect it to the project. This injects
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`). Redeploy.
4. Use the project's `*.vercel.app` domain as the Discord root URL mapping.

`GET /api/health` reports which store is active (`redis` or `file`).

### Railway / Render / a VPS

Deploy from the GitHub repo, set `VITE_DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, and
either mount a volume and set `SCORES_DIR` to it, or set the Upstash variables above.

## Daily streak reminder (optional)

Like Discord's Wordle activity, the app can post every morning and ping everyone who has
finished the puzzle on 2+ consecutive days but hasn't played yet. It runs as a Vercel cron
(`vercel.json`, `0 14 * * *` = 9 am EST / 10 am EDT) hitting `/api/cron/reminder`.

1. Developer portal → **Bot** → Add Bot → Reset Token → copy it.
2. **Installation** → Guild Install scopes: add `bot` with permissions *View Channels* and
   *Send Messages*. Re-open the install link and add the app to your server again so the bot joins.
3. Vercel env vars: `DISCORD_BOT_TOKEN`, `REMINDER_GUILD_ID` (your server ID),
   `REMINDER_CHANNEL_ID` (the channel to post in; enable Developer Mode in Discord to copy IDs),
   and `CRON_SECRET` (any long random string; Vercel sends it to the endpoint automatically).
   Redeploy.
4. Preview who would be pinged without posting:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/cron/reminder?dry=1"`

## Weekly "MapTap God" role (optional)

Every Monday the player with the highest total across the previous Monday–Sunday week (UTC) is
given a hoisted silver **MapTap God** role and announced in the reminder channel; last week's
holder loses it (ties share it). Runs as a second Vercel cron (`0 14 * * 1`) hitting
`/api/cron/weekly`, using the same bot and env vars as the streak reminder.

1. Server Settings → Roles → the bot's role → enable **Manage Roles**, and drag that role near the
   top of the list. The MapTap God role is created automatically on the first run (just below the
   bot's role; drag it above your other coloured roles so the silver name shows).
2. Optional: set `WEEKLY_ROLE_ID` to use a role you made yourself instead.
3. Preview the standings without touching roles:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/cron/weekly?dry=1"`

## Customising

- **Places**: edit `data/places.json` (`name`, `country`, `lat`, `lon`, `difficulty` 1–5, optional `population`).
  `node scripts/tag-difficulty.js` and `node scripts/add-population.js` re-tag from the lists in those scripts.
- **Quips**: `QUIPS` in `server/game.js`, bucketed by miss distance.
- **Multipliers / tier names / which tiers rounds use / time limit**: `MULTIPLIERS`, `TIER_LABELS`,
  `ROUND_TIERS` and `ROUND_SECONDS` in `server/game.js`.
- **Puzzle numbering**: `EPOCH` in `server/game.js` is puzzle #1's date.
- **Scoring curve / medal thresholds**: `scoreForDistance` and `medalForScore` in `server/game.js`.
- **Rounds per day**: `ROUNDS` in `server/game.js` and `client/src/main.js`.

## Credits & license

Inspired by [maptap.gg](https://maptap.gg/) — go play the original too.
Globe imagery: NASA Blue Marble (public domain), bundled in `client/public/textures/`.
Flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT), bundled in `client/public/flags/`
(`client/src/flags.js` maps country names to codes). Country shapes: Natural Earth via
[world-atlas](https://github.com/topojson/world-atlas).

Code is MIT licensed — see `LICENSE`.
