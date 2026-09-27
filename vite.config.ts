import { defineConfig } from 'vite'

export default defineConfig({
  // The site is a set of hand-written static pages plus one applet entry, not
  // a single-page app. Vite's default appType of 'spa' installs a history
  // fallback that rewrites any unmatched path to /index.html, which made the
  // footer links render the applet under `vite dev` and `vite preview`.
  // Cloudflare Pages serves /why/index.html for /why natively; 'mpa' makes
  // local dev and preview behave the same way. Build output is unchanged.
  appType: 'mpa',
  // MapLibre v6 resolves its ESM worker relative to the package. Vite 5's dev
  // pre-bundler otherwise rewrites the package without carrying that worker
  // beside the optimized module, producing a blank map at runtime.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    outDir: 'dist',
  },
})
