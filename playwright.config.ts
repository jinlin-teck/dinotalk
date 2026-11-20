import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

function resolveExistingChromium(): string | undefined {
  const candidates = [
    path.join(
      os.homedir(),
      ".cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell"
    ),
    path.join(
      os.homedir(),
      ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome"
    ),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

const executablePath = resolveExistingChromium();

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
