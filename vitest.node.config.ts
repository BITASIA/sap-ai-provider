import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/**/*.test.ts", "node_modules/**", "dist/**"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
