import { defineConfig } from 'vite'

export default defineConfig({
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
