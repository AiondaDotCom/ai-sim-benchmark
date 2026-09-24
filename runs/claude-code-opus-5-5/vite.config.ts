/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1024,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
