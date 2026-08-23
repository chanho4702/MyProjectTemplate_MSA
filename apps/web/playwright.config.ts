import { defineConfig, devices } from "@playwright/test";

/**
 * E2E는 production build 산출물을 실제 Chromium에서 연다. Gateway는 띄우지 않고
 * 브라우저 단계에서 /api 응답을 가로채기 때문에 백엔드 없이도 결정적으로 실행된다.
 * 실제 Keycloak·Gateway 연동은 pnpm web:e2e:oidc(playwright.oidc.config.ts)가 담당한다.
 */
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 1 : undefined,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // localhost가 IPv6로만 바인딩되는 환경이 있어 preview host를 명시적으로 고정한다.
    command: `pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: 180_000,
  },
});
