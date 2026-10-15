import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  testDir: "./tests/e2e",
  timeout: 95_000,
  workers: 1,
  fullyParallel: false,
};

export default defineConfig(config);
