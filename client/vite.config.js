import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  envDir: path.resolve(__dirname, '..'),
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    // Needed so the Cloudflare tunnel hostname is accepted when testing inside Discord.
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
    // When served through an HTTPS tunnel (cloudflared/ngrok) hot reload must talk to port 443.
    ...(process.env.VITE_TUNNEL ? { hmr: { clientPort: 443 } } : {}),
  },
});
