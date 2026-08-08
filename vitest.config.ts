import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // Every timing test drives a fake clock. Nothing should ever wait in real time,
    // so a short timeout catches an accidentally-real sleep instead of hanging CI.
    testTimeout: 5_000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
    },
  },
});
