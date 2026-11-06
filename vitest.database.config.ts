import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

const config = mergeConfig(base, defineConfig({
  test: {
    environment: "node",
    setupFiles: [],
    include: ["tests/postgres/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    coverage: { enabled: false },
  },
}));

export default defineConfig({ ...config, test: {
  ...config.test,
  exclude: configDefaults.exclude,
  setupFiles: [],
} });
