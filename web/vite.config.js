import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Vela web app (Stage 1: dashboard page).
//
// Dev/preview data strategy: `publicDir: '../globe'` with `copyPublicDir: false`
// makes the dev server serve the repo's REAL `globe/` files at the server root
// (e.g. /indexes.json, /dashboard/data/sp500.json) without ever copying them
// into `dist/`. The app fetches its registry at `../indexes.json` relative to
// the page, so `npm run dev` → http://localhost:5173/dashboard/ runs against
// live daily data. Data JSON is fetched at runtime only — never imported at
// build time.
//
// PRODUCTION PLAN (do NOT do this yet): a later cutover stage will retarget
// `build.outDir` into `globe/` (with `emptyOutDir: false`) so the built
// dashboard replaces `globe/dashboard/index.html` in place on GitHub Pages.
// For now the build stays self-contained in `web/dist/`.
// ---------------------------------------------------------------------------
export default defineConfig({
  base: './',
  publicDir: '../globe',
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: 'dist',
    assetsDir: 'app',
    copyPublicDir: false,
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL('./dashboard/index.html', import.meta.url)),
      },
    },
  },
});
