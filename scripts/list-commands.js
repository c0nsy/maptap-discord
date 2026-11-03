// Prints the app's global slash commands as Discord sees them (diagnostic). Reads .env.
import 'dotenv/config';

const { VITE_DISCORD_CLIENT_ID: id, DISCORD_CLIENT_SECRET: secret } = process.env;
const API = 'https://discord.com/api/v10';
const basic = Buffer.from(`${id}:${secret}`).toString('base64');
const tokenRes = await fetch(`${API}/oauth2/token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'applications.commands.update' }),
});
if (!tokenRes.ok) { console.error('Token request failed:', await tokenRes.text()); process.exit(1); }
const { access_token } = await tokenRes.json();
const commands = await (await fetch(`${API}/applications/${id}/commands`, { headers: { Authorization: `Bearer ${access_token}` } })).json();
console.log(JSON.stringify(commands, null, 2));
