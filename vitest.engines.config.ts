import path from "path";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** Cross-engine determinism: the same simulation code in V8, SpiderMonkey and JavaScriptCore. */
export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.engines.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
