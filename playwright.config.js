const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROME_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
        : process.platform === "darwin"
          ? {
              executablePath:
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            }
          : {}),
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:demo",
    url: "http://localhost:3000/book-consultation.html",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
