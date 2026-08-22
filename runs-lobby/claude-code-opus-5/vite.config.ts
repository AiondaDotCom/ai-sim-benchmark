import { defineConfig } from 'vite';

// `assets/` is the static root: every generated texture / sfx / music file is
// checked into the repository there and copied verbatim into `dist/`.
// Nothing is fetched from the network at runtime.
export default defineConfig({
  publicDir: 'assets',
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  server: { open: false },
});
