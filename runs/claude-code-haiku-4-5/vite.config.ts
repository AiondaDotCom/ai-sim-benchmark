import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    host: 'localhost'
  },
  build: {
    target: 'ES2020',
    minify: 'terser',
    sourcemap: false
  }
})
