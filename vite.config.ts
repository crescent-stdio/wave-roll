import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        minThreads: 1,
        maxThreads: 1,
      },
    },
    globals: true,
    setupFiles: [],
    reporters: ["default"],
    coverage: {
      enabled: false,
    },
  },
  // Development server configuration
  server: {
    port: 3000,
    open: true,
    host: true,
  },

  // Build configuration for library
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "WaveRoll",
      fileName: (format) => `wave-roll.${format}.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        // Ensure UMD build works in browsers
        assetFileNames: 'wave-roll.[ext]',
      },
    },
  },

  // Ensure TypeScript files are served in development
  optimizeDeps: {
    include: ["@tonejs/midi"],
    esbuildOptions: {
      target: "es2020",
    },
  },

  // Ensure proper module resolution
  resolve: {
    alias: {
      "@/core": resolve(__dirname, "src/lib/core"),
      "@/demos": resolve(__dirname, "src/demos"),
      "@/components": resolve(__dirname, "src/lib/components"),
      "@/lib": resolve(__dirname, "src/lib"),
      "@/assets": resolve(__dirname, "src/assets"),
      "@/types": resolve(__dirname, "src/lib/types/index.ts"),
    },
    conditions: ["module", "browser", "import", "default"],
  },
});
