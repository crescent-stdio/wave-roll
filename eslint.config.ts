import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default defineConfig(
  { ignores: ["dist/", "node_modules/"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": "warn",
      "no-case-declarations": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "no-prototype-builtins": "warn",
    },
  },
);
