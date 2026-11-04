import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: [
        "src/server/**/*.ts",
        "src/shared/**/*.ts",
        "gateway/functions/**/*.ts",
      ],
      exclude: ["**/*.d.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: { statements: 85, branches: 75, functions: 90, lines: 90 },
    },
  },
});
