import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

function resolveExistingChromium(): string | undefined {
  const cacheDir = path.join(os.homedir(), ".cache/ms-playwright");
  if (!fs.existsSync(cacheDir)) return undefined;

  const entries = fs
    .readdirSync(cacheDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  for (const name of entries) {
    if (name.startsWith("chromium_headless_shell-")) {
      const bin = path.join(cacheDir, name, "chrome-headless-shell-linux64/chrome-headless-shell");
      if (fs.existsSync(bin)) return bin;
    }
    if (name.startsWith("chromium-")) {
      const bin = path.join(cacheDir, name, "chrome-linux64/chrome");
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

const executablePath = resolveExistingChromium();
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3100";
const e2eDataDir = process.env.DATA_DIR || path.join(os.tmpdir(), "dinotalk-e2e-data");

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "pnpm e2e:serve",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 300000,
        env: { DATA_DIR: e2eDataDir, PORT: "3100" },
      },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
