import { defineConfig, devices } from "@playwright/test";

/**
 * 실제 IdP 통합 E2E 설정이다. tools/e2e/run-oidc-e2e.mjs가 PostgreSQL,
 * Keycloak, sample-service, Gateway와 SPA preview를 전용 포트에 띄운 뒤 이
 * 설정으로 Playwright를 실행한다. stub 기반 기본 E2E(playwright.config.ts)와
 * 달리 API와 로그인 흐름을 가로채지 않는다.
 */
const baseURL = process.env.OIDC_E2E_WEB_URL ?? "http://127.0.0.1:14173";

export default defineConfig({
  testDir: "./e2e-oidc",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
