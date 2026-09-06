import { defineConfig } from 'vite';

// Stamped into the bundle so a playtest report says which build it came from.
// GitHub Actions supplies the sha; a local build says "local".
const sha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
const built = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify(`${sha} · ${built}`)
  },
  server: {
    port: 5173,
    open: false
  }
});
