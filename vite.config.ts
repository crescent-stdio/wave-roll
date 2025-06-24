import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // Development server configuration
  server: {
    port: 3000,
    open: true,
    host: true
  },
  
  // Build configuration for library
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WaveRoll',
      fileName: (format) => `wave-roll.${format}.js`
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  },

  // Ensure TypeScript files are served in development
  optimizeDeps: {
    include: []
  }
})