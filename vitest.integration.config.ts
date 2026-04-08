import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/modules/theme/__tests__/theme.inheritance.test.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
    env: {
      ALLOW_THEME_INTEGRATION_TESTS: "true",
      DISABLE_REDIS: "true",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
