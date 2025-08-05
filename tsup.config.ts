import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist',
    dts: true,
    sourcemap: true,
    clean: true,
    outExtension: () => ({ js: '.mjs' }),
  },
  // CommonJS build
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    outDir: 'dist',
    dts: false, // Only generate types once
    sourcemap: true,
    outExtension: () => ({ js: '.js' }),
  },
]);
