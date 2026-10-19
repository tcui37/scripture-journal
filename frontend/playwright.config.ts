import { defineConfig } from "@playwright/test";

/**
 * Browser tests against a private backend (:8001) and dev server (:3001).
 *
 * The backend runs with both API keys blanked, so nothing here can spend the
 * api.bible quota or call Crossway: only the keyless sources answer. Layout
 * tests use committed public-domain fixtures and need no network at all.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3001",
    channel: "chrome",
    headless: true,
    actionTimeout: 10_000,
  },
  webServer: [
    {
      command:
        "cd ../backend && API_BIBLE_KEY= ESV_API_KEY= SUPABASE_SERVICE_ROLE_KEY= " +
        ".venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "NEXT_DIST_DIR=.next-e2e API_URL=http://127.0.0.1:8001 npx next dev -p 3001",
      url: "http://localhost:3001",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
