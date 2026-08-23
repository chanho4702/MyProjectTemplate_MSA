import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * production image smoke다. 브라우저 단계 stub 없이 실제
 * container(nginx) → ingress(nginx) → Gateway → sample-service → PostgreSQL
 * 경로를 확인한다. SPA와 /api가 같은 origin이므로 CORS preflight가 없어야 한다.
 */
const ALT_WEB_URL = process.env.FRONTEND_SMOKE_ALT_URL ?? "http://127.0.0.1:28091";

interface ObservedRequests {
  readonly apiOrigins: string[];
  readonly preflightUrls: string[];
}

function observeRequests(page: Page): ObservedRequests {
  const apiOrigins: string[] = [];
  const preflightUrls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") preflightUrls.push(request.url());
    if (url.pathname.startsWith("/api/")) apiOrigins.push(url.origin);
  });
  return { apiOrigins, preflightUrls };
}

test("ingress 경유 SPA에서 same-origin으로 조회와 생성이 동작한다", async ({ page, baseURL }, testInfo) => {
  const observed = observeRequests(page);

  await page.goto("/");
  await expect(page.locator(".environment-badge")).toContainText("LOCAL");
  await expect(page.getByRole("heading", { name: "저장된 항목" })).toBeVisible();
  await expect(page.getByLabel("API 요청 경로")).not.toContainText("확인 필요");

  const itemName = `image-smoke-${testInfo.project.name}-${Date.now()}`;
  await page.getByLabel("항목 이름").fill(itemName);
  await page.getByRole("button", { name: /writer DB에 저장/ }).click();

  await expect(page.locator(".form-message")).toContainText("writer DB에 저장했습니다.");
  await expect(page.locator(".item-list li").first()).toContainText(itemName);

  const ingressOrigin = new URL(baseURL ?? "").origin;
  expect(observed.apiOrigins.length).toBeGreaterThanOrEqual(2);
  expect(new Set(observed.apiOrigins)).toEqual(new Set([ingressOrigin]));
  expect(observed.preflightUrls).toEqual([]);
});

test("health 경계와 환경별 app-config 재사용이 동작한다", async ({ request, baseURL }) => {
  const ingressHealth = await request.get(`${baseURL}/ingress-health`);
  expect(ingressHealth.status()).toBe(200);

  // 같은 이미지의 두 번째 container는 다른 app-config.json을 mount했다.
  const altHealth = await request.get(`${ALT_WEB_URL}/healthz`);
  expect(altHealth.status()).toBe(200);

  const ingressConfig = (await (await request.get(`${baseURL}/app-config.json`)).json()) as { environment: string };
  const altConfig = (await (await request.get(`${ALT_WEB_URL}/app-config.json`)).json()) as { environment: string };
  expect(ingressConfig.environment).toBe("local");
  expect(altConfig.environment).toBe("dev");
});
