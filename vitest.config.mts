import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@shared", replacement: resolve("src/shared") },
      { find: /^@paperweight\/analysis$/, replacement: resolve("analysis/src/index.ts") },
      { find: "@paperweight/analysis", replacement: resolve("analysis/src") },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    clearMocks: false,
    pool: "forks",
    include: ["src/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
