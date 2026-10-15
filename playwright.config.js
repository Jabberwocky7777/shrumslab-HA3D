import { defineConfig } from '@playwright/test';

const port = 4178;

export default defineConfig({
  testDir: 'tests/render',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: false,
    launchOptions: {
      // WebGL without a GPU: SwiftShader, as in CI.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    },
  },
  webServer: {
    command: 'node tests/harness/server.mjs',
    url: `http://127.0.0.1:${port}/tests/harness/`,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
  },
});
