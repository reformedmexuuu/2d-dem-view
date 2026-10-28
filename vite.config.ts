import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' keeps all asset URLs relative, so the build works on
// https://<user>.github.io/<repo>/ without hardcoding the repo name.
// The demo parser (WASM) is built separately into public/parser by scripts/build-parser.sh.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
