// Playwright E2E 및 레이아웃(React SPA) 테스트 설정 (X2, LG-1)
'use strict';
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  // Keep AV-3 real-account sessions and evidence outside Playwright cleanup.
  outputDir: './test-results/playwright',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});

