import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    pool: "threads",
    fileParallelism: false,
    globals: true,
    setupFiles: ["./test/setup.ts"],
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
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "WaveRoll",
      fileName: (format) => `wave-roll.${format}.js`,
      formats: ["es", "umd"],
    },
    rolldownOptions: {
      external: [],
      output: {
        globals: {},
        // Ensure UMD build works in browsers
        assetFileNames: "wave-roll.[ext]",
      },
    },
  },

  // Ensure TypeScript files are served in development
  oxc: {
    target: "es2020",
  },
  optimizeDeps: {
    include: ["@tonejs/midi"],
  },

  // Ensure proper module resolution
  resolve: {
    alias: {
      "@/core": resolve(import.meta.dirname, "src/lib/core"),
      "@/demos": resolve(import.meta.dirname, "src/demos"),
      "@/components": resolve(import.meta.dirname, "src/lib/components"),
      "@/lib": resolve(import.meta.dirname, "src/lib"),
      "@/assets": resolve(import.meta.dirname, "src/assets"),
      "@/types": resolve(import.meta.dirname, "src/lib/types/index.ts"),
      "@/web-component": resolve(import.meta.dirname, "src/web-component.ts"),
    },
    conditions: ["module", "browser", "import", "default"],
  },
});
