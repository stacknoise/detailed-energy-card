import { defineConfig } from "@playwright/test";

// Locally the installed Edge is used (no browser download); CI installs Chromium.
const channel = process.env.CI ? undefined : "msedge";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  webServer: {
    command: "npx vite --port 4173 --strictPort",
    url: "http://localhost:4173/dev/index.html",
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:4173", channel, viewport: { width: 512, height: 900 } },
  projects: [
    { name: "e2e", testMatch: "card.spec.ts" },
    // Not a regression test: renders the README screenshots. Run with `npm run screenshots`.
    {
      name: "screenshots",
      testMatch: "screenshots.spec.ts",
      use: { deviceScaleFactor: 2, reducedMotion: "reduce" },
    },
  ],
});
