import { DiscordSDK } from '@discord/embedded-app-sdk';
import { createMap } from './map.js';
import { flag } from './flags.js';

const ROUNDS = 5;
const $ = (id) => document.getElementById(id);

// Inside Discord the iframe is served from discordsays.com and all requests to our server
// must go through Discord's proxy at /.proxy/. In a plain browser tab we hit the server directly.
const inDiscord = new URLSearchParams(location.search).has('frame_id');
const API = inDiscord ? '/.proxy/api' : '/api';

let auth = null;        // { access_token, user, guildId }
let discordSdk = null;
let daily = null;       // today's puzzle from the server (cached)
let game = null;        // { mode: 'daily'|'practice', seed?, number, rounds, maxTotal }
let round = 0;
let total = 0;
let results = [];       // per-round { km, base, multiplier, score, emoji, target, quip }
let phase = 'idle';     // idle | guessing | revealing | shown
let advanceTimer = null;

const map = createMap($('map'), {
  onTap: (ll) => {
    if (phase === 'guessing' && ll) submitGuess(ll);
    else if (phase === 'shown') advance();          // tap to skip the wait
  },
});

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (auth?.access_token) headers.Authorization = `Bearer ${auth.access_token}`;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data });
  return data;
}

// ---------- Discord setup ----------
async function setupDiscord() {
  if (!inDiscord) {
    // Local browser testing: the server accepts a dev user when DEV_FAKE_USER is set.
    auth = { access_token: 'dev', guildId: 'dev-guild' };
    return;
  }
  discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
  await discordSdk.ready();
  const { code } = await discordSdk.commands.authorize({
    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });
  const { access_token } = await api('/token', { method: 'POST', body: JSON.stringify({ code }) });
  const authed = await discordSdk.commands.authenticate({ access_token });
  auth = { access_token, user: authed.user, guildId: discordSdk.guildId || 'dm' };
}

// ---------- HUD ----------
function fmtScore(n) { return String(n).padStart(3, '0'); }
function setHud() {
  const practice = game.mode === 'practice';
  $('puzzle-no').textContent = practice ? 'Practice' : `MapTap #${game.number}`;
  $('hud-date').textContent = practice ? 'Unranked' : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  $('score').textContent = fmtScore(total);
}
// Count the score box up like a meter
function tickScore(from, to, ms = 700) {
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    $('score').textContent = fmtScore(Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Game flow ----------
async function loadDaily() {
  daily = await api(`/daily?guildId=${encodeURIComponent(auth.guildId)}`);
  game = { mode: 'daily', number: daily.number, rounds: daily.rounds, maxTotal: daily.maxTotal };
  results = []; total = 0; round = 0;
  map.clearHistory();
  const p = daily.progress;
  if (p && p.rounds.length) {
    results = p.rounds.map((r) => ({ ...r }));
    total = p.total;
    round = p.rounds.length;
  }
  setHud();
  if (p?.finished) return showFinal();
  startRound();
}

async function startPractice() {
  const pr = await api('/practice');
  game = { mode: 'practice', seed: pr.seed, rounds: pr.rounds, maxTotal: pr.maxTotal };
  results = []; total = 0; round = 0;
  map.clearHistory();
  closeSheets();
  setHud();
  startRound();
}

function startRound() {
  clearTimeout(advanceTimer);
  map.clear();
  if (round === 0) map.reset();
  const place = game.rounds[round];
  const tier = $('tier');
  tier.textContent = `${place.tier} - ${place.multiplier}x Multiplier`;
  tier.className = `tier t${round + 1}`;
  $('prompt-text').innerHTML = `<span>Tap as close as you can to</span><b>${escapeHtml(placeLabel(place))}</b>`;
  $('prompt-box').classList.remove('faded');
  phase = 'guessing';
}

async function submitGuess(ll) {
  phase = 'revealing';
  try {
    const body = { round, lat: ll[1], lon: ll[0] };
    let r;
    if (game.mode === 'practice') {
      r = await api('/practice/guess', { method: 'POST', body: JSON.stringify({ ...body, seed: game.seed }) });
    } else {
      r = await api('/guess', { method: 'POST', body: JSON.stringify({ ...body, guildId: auth.guildId }) });
    }
    results[round] = r;
    $('prompt-box').classList.add('faded');
    map.reveal(r.target, ll, r.km, (el) => showResult(el, r));
  } catch (e) {
    if (e.data?.progress) return loadDaily(); // state drifted (e.g. played elsewhere) – resync
    alert(e.message);
    phase = 'guessing';
    map.setLocked(false);
  }
}

// Types the result out line by line, like a terminal.
async function showResult(el, r) {
  const t = r.target;
  const mult = r.multiplier > 1 ? ` (${r.base} × ${r.multiplier})` : '';
  const lines = [
    { cls: 'rl-name', html: `${flag(t.country)} ${escapeHtml(placeLabel(t))}` },
    { cls: 'rl-cyan', text: `Distance: ${r.km.toLocaleString()} km` },
    { cls: 'rl-cyan', text: `Score: ${r.score.toLocaleString()}${mult}` },
    t.population ? { cls: 'rl-green', text: `Population: ${fmtPop(t.population)}` } : null,
    r.quip ? { cls: 'rl-quip', text: r.quip } : null,
  ].filter(Boolean);
  el.innerHTML = '';
  const before = total;
  total = game.mode === 'practice' ? total + r.score : r.total;
  for (const ln of lines) {
    const div = document.createElement('div');
    div.className = ln.cls;
    el.appendChild(div);
    if (ln.html) { div.innerHTML = ln.html; await wait(220); continue; }
    for (let i = 1; i <= ln.text.length; i++) { div.textContent = ln.text.slice(0, i); await wait(18); }
    if (ln.text.startsWith('Score')) tickScore(before, total);
    await wait(120);
  }
  phase = 'shown';
  advanceTimer = setTimeout(advance, 3200);
}

function advance() {
  if (phase !== 'shown') return;
  clearTimeout(advanceTimer);
  round++;
  if (round >= ROUNDS) { phase = 'idle'; showFinal(); } else startRound();
}

function fmtPop(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  if (n >= 1e3) return `${Math.round(n / 1e3)},000`.replace(/^(\d+),000$/, (_, k) => `${k},000`);
  return String(n);
}
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

$('zoom-in').onclick = () => map.zoomIn();
$('zoom-out').onclick = () => map.zoomOut();
$('zoom-reset').onclick = () => map.reset();

// Same shape as maptap.gg's share:  "95🥇 100🎯 94🥈 94🥈 100🎯 / Final score: 965"
function medalLine() { return results.map((r) => `${r.base}${r.emoji}`).join(' '); }
function shareText() {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const head = game.mode === 'practice' ? 'MapTap practice' : `MapTap #${game.number} ${date}`;
  return `${head}\n${medalLine()}\nFinal score: ${total}`;
}

function showFinal() {
  const practice = game.mode === 'practice';
  map.clear();
  $('tier').textContent = practice ? 'Practice complete' : 'Daily complete';
  $('tier').className = 'tier t1';
  $('prompt-text').textContent = practice ? 'Practice game finished' : "You've filled this day in!";
  $('prompt-box').classList.remove('faded');
  $('score').textContent = fmtScore(total);
  $('final-title').textContent = practice ? 'Practice finished' : "You've filled this day in!";
  $('final-grid').textContent = medalLine();
  $('final-total').textContent = `Final score: ${total}`;
  $('final-rows').innerHTML = results.map((r, i) =>
    `<div class="final-row"><span>${flag(r.target.country)} ${escapeHtml(r.target.name)} <span class="dim">· ${game.rounds[i].tier}</span></span><span class="km">${r.km.toLocaleString()} km · ${r.base}${r.emoji} ×${r.multiplier} = ${r.score}</span></div>`
  ).join('');
  $('btn-final-board').classList.toggle('hidden', practice);
  $('final-note').classList.toggle('hidden', practice);
  $('final-sheet').classList.remove('hidden');
}

$('btn-share').onclick = async () => {
  const text = shareText();
  let done = false;
  if (discordSdk) {
    try { await discordSdk.commands.shareLink?.({ message: text }); done = true; } catch { /* fall through */ }
  }
  if (!done) {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }
  const t = $('toast'); t.textContent = done ? 'Shared!' : 'Copied to clipboard!';
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 1800);
};

// ---------- Sheets: menu, leaderboard, help ----------
function closeSheets() { document.querySelectorAll('.sheet').forEach((s) => s.classList.add('hidden')); }
function finishedView() { return results.length === ROUNDS && results.every(Boolean) && phase === 'idle'; }

async function showBoard() {
  const { board, maxTotal } = await api(`/leaderboard?guildId=${encodeURIComponent(auth.guildId)}`);
  const me = auth.user?.id;
  $('board').innerHTML = board.length ? board.map((p, i) => `
    <div class="board-row ${p.userId === me ? 'me' : ''}">
      <span class="rank">${i + 1}</span>
      ${p.avatar ? `<img src="${p.avatar}" alt="">` : '<span class="avatar-fallback"></span>'}
      <span class="name">${escapeHtml(p.username)}</span>
      <span class="emojis">${p.emojis}${p.finished ? '' : ' …'}</span>
      <span class="total" title="out of ${maxTotal}">${p.total.toLocaleString()}</span>
    </div>`).join('')
    : '<div class="board-empty">Nobody has played today yet. Be the first!</div>';
  closeSheets();
  $('board-sheet').classList.remove('hidden');
}
// "Toronto, Canada" – but just "Singapore" when city and country are the same.
function placeLabel(p) { return p.name === p.country ? p.name : `${p.name}, ${p.country}`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const reopenFinal = () => { closeSheets(); if (finishedView()) $('final-sheet').classList.remove('hidden'); };
$('btn-menu').onclick = () => { closeSheets(); $('menu-sheet').classList.remove('hidden'); };
$('btn-menu-close').onclick = reopenFinal;
$('menu-board').onclick = showBoard;
$('menu-practice').onclick = startPractice;
$('btn-practice').onclick = startPractice;
$('menu-daily').onclick = () => { closeSheets(); loadDaily(); };
$('btn-final-board').onclick = showBoard;
$('btn-board-close').onclick = reopenFinal;

// ---------- boot ----------
(async () => {
  try {
    await setupDiscord();
    await loadDaily();
  } catch (e) {
    console.error(e);
    $('prompt-text').textContent = `Couldn't start: ${e.message}`;
  }
})();
