import { defineConfig, devices } from "@playwright/test";

/**
 * production image smoke 설정이다. tools/e2e/run-frontend-image-smoke.mjs가
 * 프론트 container → ingress → Gateway → sample-service 스택을 전용 포트에
 * 띄운 뒤 이 설정으로 실행한다. 데스크톱 Chromium, 모바일 viewport와
 * Chromium 외 브라우저(Firefox)를 함께 검증한다.
 */
const baseURL = process.env.FRONTEND_SMOKE_URL ?? "http://127.0.0.1:28090";

export default defineConfig({
  testDir: "./e2e-image",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
