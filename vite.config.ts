import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { copyFileSync, cpSync } from 'node:fs';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Root is src/ so the emitted page lands at dist/diary.html rather than
  // dist/src/diary.html, keeping the chrome-extension:// URLs flat.
  root: at('src'),
  publicDir: false,
  build: {
    outDir: at('dist'),
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    rollupOptions: {
      input: {
        diary: at('src/diary.html'),
        'service-worker': at('src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  worker: { format: 'es' },
  plugins: [
    {
      name: 'copy-static',
      closeBundle() {
        copyFileSync(at('src/manifest.json'), at('dist/manifest.json'));
        cpSync(at('src/icons'), at('dist/icons'), { recursive: true });
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    root: at('.'),
  },
});
