import js from "@eslint/js";
import typescript from "typescript-eslint";
import globals from "globals";

export default [
  // Base configurations
  js.configs.recommended,
  ...typescript.configs.recommended,

  // Global configuration
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
      ecmaVersion: 2020,
      sourceType: "module",
    },
  },

  // TypeScript-specific rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: typescript.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // Clean code rules
      "max-lines-per-function": ["warn", { max: 50, skipComments: true }],
      "max-params": ["warn", 4],
      "complexity": ["warn", 10],
      "max-depth": ["warn", 4],
      "no-magic-numbers": ["warn", { ignore: [0, 1, -1] }],
      "prefer-const": "error",
      "no-var": "error",
      
      // TypeScript-specific
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-readonly": "warn",
    },
  },

  // Ignore patterns
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "examples/**",
      "*.config.js",
      "*.config.ts",
    ],
  },
];