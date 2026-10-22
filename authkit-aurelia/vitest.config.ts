import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

// Vite resolves its internal `/@vite/env` module relative to the project root.
// This checkout lives under a path containing "#", which Vite treats as a URL
// fragment, so the internal module is pinned explicitly.
const viteEnvModule = fileURLToPath(
  new URL('./node_modules/vite/dist/client/env.mjs', import.meta.url),
);

const pinViteEnv: Plugin = {
  name: 'authkit-pin-vite-env',
  enforce: 'pre',
  resolveId(id) {
    if (id === '/@vite/env' || id === '@vite/env') {
      return viteEnvModule;
    }
    return null;
  },
};

export default defineConfig({
  plugins: [pinViteEnv],
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
