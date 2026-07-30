/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages project site: https://enesgokhan.github.io/retrobus/
export default defineConfig({
  base: '/retrobus/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Node 25's built-in Web Storage global shadows jsdom's localStorage;
    // disable it in worker processes so jsdom's version wins.
    execArgv: ['--no-experimental-webstorage'],
  },
})
