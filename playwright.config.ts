import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const e2eDataDir = path.resolve("tmp/playwright-data");
const e2eBackupDir = path.resolve("tmp/playwright-backups");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8878",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "py -3.14 server.py",
    url: "http://127.0.0.1:8878/",
    env: {
      GARMIN_DASHBOARD_HOST: "127.0.0.1",
      GARMIN_DASHBOARD_PORT: "8878",
      GARMIN_DASHBOARD_DB_PATH: path.join(e2eDataDir, "garmin-dashboard.sqlite3"),
      GARMIN_DASHBOARD_BACKUP_DIR: e2eBackupDir,
    },
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
