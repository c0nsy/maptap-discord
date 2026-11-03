// Renames the Entry Point slash command Discord auto-created ("/launch") so players can type
// /maptap instead. Run once from the project folder after filling in .env:
//
//   node scripts/rename-command.js            → /maptap
//   node scripts/rename-command.js geo        → /geo
//
// Uses the client-credentials grant with VITE_DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET from .env.
import 'dotenv/config';

const { VITE_DISCORD_CLIENT_ID: id, DISCORD_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Set VITE_DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env first.');
  process.exit(1);
}
const name = (process.argv[2] || 'maptap').toLowerCase();
const description = process.argv[3] || 'Play today\'s MapTap: tap the globe as close as you can to 5 places';

const API = 'https://discord.com/api/v10';
const basic = Buffer.from(`${id}:${secret}`).toString('base64');

const tokenRes = await fetch(`${API}/oauth2/token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'applications.commands.update' }),
});
if (!tokenRes.ok) { console.error('Token request failed:', await tokenRes.text()); process.exit(1); }
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

const commands = await (await fetch(`${API}/applications/${id}/commands`, { headers: auth })).json();
const entry = commands.find((c) => c.type === 4); // PRIMARY_ENTRY_POINT
if (!entry) {
  console.error('No Entry Point command found. Enable Activities in the developer portal first.');
  process.exit(1);
}
console.log(`Found entry point command "/${entry.name}" (${entry.id}); renaming to "/${name}"…`);

const res = await fetch(`${API}/applications/${id}/commands/${entry.id}`, {
  method: 'PATCH', headers: auth,
  // Discord's auto-created command carries localized "launch" names that clients display
  // in preference to `name`, so clear them too.
  body: JSON.stringify({ name, description, name_localizations: null, description_localizations: null, handler: 2 /* DISCORD_LAUNCH_ACTIVITY */ }),
});
if (!res.ok) { console.error('Rename failed:', await res.text()); process.exit(1); }
console.log(`Done: /${name} launches the Activity. Discord can take up to an hour to show the new name.`);
