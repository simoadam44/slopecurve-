import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/api/games",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173" },
});
