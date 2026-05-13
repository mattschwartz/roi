import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Path aliases come from tsconfig.json via `vite-tsconfig-paths`.
// Do NOT mirror them in `resolve.alias` — tsconfig is the single
// source of truth (see proposal section 4).
export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
