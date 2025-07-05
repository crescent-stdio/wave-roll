import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
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
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
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
      "@/core": resolve(__dirname, "src/core"),
      "@/demos": resolve(__dirname, "src/demos"),
      "@/components": resolve(__dirname, "src/components"),
      "@/assets": resolve(__dirname, "src/assets"),
      "@/types": resolve(__dirname, "src/core/types/index.ts"),
    },
    conditions: ["module", "browser", "import", "default"],
  },
});
