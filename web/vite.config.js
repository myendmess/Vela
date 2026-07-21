import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Vela web app — Svelte MPA: globe landing page (index.html → globe/index.html)
// + treemap dashboard (dashboard/index.html → globe/dashboard/index.html).
//
// Dev (`npm run dev`): publicDir '../globe' serves the repo's REAL globe/ files
// at the dev-server root (/indexes.json, /dashboard/data/sp500.json, …) so the
// app runs against live daily data. Data JSON is fetched at RUNTIME only —
// never imported at build time.
//
// Build (`npm run build`) — PRODUCTION CUTOVER: output is written in place into
// ../globe with emptyOutDir:false, so it overwrites ONLY globe/index.html,
// globe/dashboard/index.html and the hashed globe/app/* assets, while leaving
// the machine-committed data (globe/indexes.json, globe/data/**,
// globe/dashboard/data/**), globe/scripts/** and globe/README.md byte-untouched.
// publicDir is disabled for the build so those data files are never copied into,
// or cleared from, the output. GitHub Pages stays deploy-from-branch — no
// settings change; the URLs printed in every published video keep working.
//
// NOTE: with emptyOutDir:false Vite does not clean globe/app/, so .github/
// workflows/web.yml removes globe/app/ before each rebuild to stop stale hashed
// assets accumulating. base:'./' keeps every asset/data path relative, so the
// build is correct under the /Vela/globe/ subpath without any base config.
// ---------------------------------------------------------------------------
export default defineConfig(({ command }) => ({
  base: './',
  publicDir: command === 'serve' ? '../globe' : false,
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: '../globe',
    assetsDir: 'app',
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: {
      input: {
        globe: fileURLToPath(new URL('./index.html', import.meta.url)),
        dashboard: fileURLToPath(new URL('./dashboard/index.html', import.meta.url)),
      },
    },
  },
}));
