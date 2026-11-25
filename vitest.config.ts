import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.claude'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Next.js' `server-only` Pragma ist nicht als npm-Modul installiert
      // (es ist Teil der Next-Runtime); in Tests stubben wir es zu einem
      // leeren Modul, damit Module mit `import "server-only"` ladbar bleiben.
      'server-only': resolve(__dirname, './src/test/empty.ts'),
      // PROJ-32: next/font wird nur im Next-Build ersetzt, in Tests ein Platzhalter.
      'next/font/google': resolve(__dirname, './src/test/next-font-stub.ts'),
      'next/font/local': resolve(__dirname, './src/test/next-font-stub.ts'),
    },
  },
})
