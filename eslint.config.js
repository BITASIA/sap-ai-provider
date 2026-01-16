// @ts-check
import eslint from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
// import markdownlintPlugin from "eslint-plugin-markdownlint";
// import markdownlintParser from "eslint-plugin-markdownlint/parser.js";
import perfectionist from "eslint-plugin-perfectionist";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  eslint.configs.recommended,
  jsdoc.configs["flat/recommended-typescript"],
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  perfectionist.configs["recommended-natural"],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    extends: [tseslint.configs.disableTypeChecked],
    files: ["*.config.{js,mjs}"],
  },
  // {
  //   extends: [tseslint.configs.disableTypeChecked],
  //   files: ["**/*.md"],
  //   languageOptions: {
  //     parser: markdownlintParser,
  //   },
  //   plugins: {
  //     // @ts-ignore
  //     markdownlint: markdownlintPlugin,
  //   },
  //   // @ts-ignore
  //   rules: {
  //     ...markdownlintPlugin.configs.recommended.rules,
  //   },
  // },
);
