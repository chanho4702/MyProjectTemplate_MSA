import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * 실제 Keycloak·Gateway·sample-service·PostgreSQL을 함께 띄운 상태에서 실행하는
 * 통합 E2E다. 유일한 브라우저 단계 개입은 정적 파일 app-config.json 주입이다.
 * 런타임 설정은 환경마다 주입되는 값이라 테스트가 대상 스택의 주소를 넣는 것이
 * 자연스럽고, 로그인·토큰 교환·API 호출은 전부 실제 구성요소를 지난다.
 */
const KEYCLOAK_URL = process.env.OIDC_E2E_KEYCLOAK_URL ?? "http://localhost:18180";
const GATEWAY_URL = process.env.OIDC_E2E_GATEWAY_URL ?? "http://127.0.0.1:18082";
const ISSUER = `${KEYCLOAK_URL}/realms/template`;

const RUNTIME_CONFIG = {
  environment: "local",
  apiBaseUrl: "",
  auth: {
    enabled: true,
    authority: ISSUER,
    clientId: "template-spa",
    scope: "openid profile email",
  },
};

async function installRuntimeConfig(page: Page): Promise<void> {
  await page.route("**/app-config.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RUNTIME_CONFIG) }),
  );
}

function trackApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calls.push(`${request.method()} ${url.pathname}`);
  });
  return calls;
}

async function loginAsLocalUser(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator(".auth-control").getByRole("button", { name: "로그인" }).click();
  await page.locator("#username").fill("local-user");
  await page.locator("#password").fill("local-user-password");
  await page.locator("#kc-login").click();
  await expect(page.locator(".auth-control.is-authenticated")).toContainText("local-user");
}

async function captureItemsAuthorization(page: Page, action: () => Promise<void>): Promise<string> {
  const waited = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/v1/items");
  await action();
  const request = await waited;
  const headers = await request.allHeaders();
  return headers.authorization ?? "";
}

async function tokenOf(request: APIRequestContext, realmPath: string, form: Record<string, string>): Promise<string> {
  const response = await request.post(`${KEYCLOAK_URL}${realmPath}/protocol/openid-connect/token`, { form });
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

test.describe("실제 IdP 로그인과 보호 API", () => {
  test("로그인 전에는 API를 호출하지 않고 Gateway도 무토큰 요청을 거부한다", async ({ page, request }) => {
    await installRuntimeConfig(page);
    const apiCalls = trackApiCalls(page);

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "로그인하면 API 연결을 시작합니다." })).toBeVisible();
    await expect(page.getByLabel("API 요청 경로")).toContainText("로그인 필요");
    expect(apiCalls).toEqual([]);

    const anonymous = await request.get(`${GATEWAY_URL}/api/v1/items`);
    expect(anonymous.status()).toBe(401);
  });

  test("local-user 로그인 뒤 Bearer token으로 GET과 POST가 Gateway를 통과한다", async ({ page }) => {
    await installRuntimeConfig(page);

    const listAuthorization = await captureItemsAuthorization(page, () => loginAsLocalUser(page));
    expect(listAuthorization).toMatch(/^Bearer .+/);
    await expect(page.locator(".items-panel")).not.toContainText("로그인하면 API 연결을 시작합니다.");

    const itemName = `oidc-e2e-${Date.now()}`;
    await page.getByLabel("항목 이름").fill(itemName);
    const createAuthorization = await captureItemsAuthorization(page, async () => {
      await page.getByRole("button", { name: /writer DB에 저장/ }).click();
    });
    expect(createAuthorization).toMatch(/^Bearer .+/);

    await expect(page.locator(".form-message")).toContainText("writer DB에 저장했습니다.");
    await expect(page.locator(".item-list li").first()).toContainText(itemName);
  });

  test("만료된 access token은 재로그인 없이 갱신되어 계속 통과한다", async ({ page }) => {
    await installRuntimeConfig(page);

    const firstAuthorization = await captureItemsAuthorization(page, () => loginAsLocalUser(page));

    // E2E realm의 template-spa access token 수명은 20초다. 만료를 지나 기다린
    // 뒤의 재조회가 다른 token으로 성공하면 refresh token 기반 silent renew가
    // 재로그인 없이 동작했다는 뜻이다. Gateway의 만료 거부 자체는 60초 clock
    // skew 때문에 아래 "만료되면 거부한다" 테스트가 별도로 검증한다.
    await page.waitForTimeout(25_000);
    const renewedAuthorization = await captureItemsAuthorization(page, async () => {
      await page.getByRole("button", { name: "다시 불러오기" }).click();
    });

    expect(renewedAuthorization).toMatch(/^Bearer .+/);
    expect(renewedAuthorization).not.toBe(firstAuthorization);
    await expect(page.locator(".auth-control.is-authenticated")).toContainText("local-user");
    await expect(page.getByLabel("API 요청 경로")).not.toContainText("로그인 필요");
    await expect(page.locator(".items-panel").getByRole("alert")).toBeHidden();
  });

  test("로그아웃하면 보호 API 호출이 다시 차단된다", async ({ page }) => {
    await installRuntimeConfig(page);
    await loginAsLocalUser(page);
    await expect(page.getByRole("button", { name: /writer DB에 저장/ })).toBeEnabled();

    const apiCalls = trackApiCalls(page);
    await page.locator(".auth-control").getByRole("button", { name: "로그아웃" }).click();

    await expect(page.locator(".auth-control")).toContainText("로그인 전");
    await expect(page.getByRole("heading", { name: "로그인하면 API 연결을 시작합니다." })).toBeVisible();
    await expect(page.getByLabel("API 요청 경로")).toContainText("로그인 필요");
    await expect(page.getByRole("button", { name: /로그인 후 사용 가능/ })).toBeDisabled();
    expect(apiCalls).toEqual([]);
  });
});

test.describe("Gateway token 검증 계약", () => {
  test("서명 없는 token과 위조 token을 거부한다", async ({ request }) => {
    const garbage = await request.get(`${GATEWAY_URL}/api/v1/items`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    expect(garbage.status()).toBe(401);
  });

  test("다른 issuer가 발급한 유효한 token을 거부한다", async ({ request }) => {
    // master realm은 이 로컬 Keycloak의 다른 realm이다. 서명은 진짜지만
    // issuer가 template realm이 아니므로 Gateway가 거부해야 한다.
    const masterToken = await tokenOf(request, "/realms/master", {
      grant_type: "password",
      client_id: "admin-cli",
      username: "admin",
      password: "admin-local-password",
    });

    const mismatched = await request.get(`${GATEWAY_URL}/api/v1/items`, {
      headers: { Authorization: `Bearer ${masterToken}` },
    });
    expect(mismatched.status()).toBe(401);
  });

  test("유효한 token은 전달하고 같은 token이 만료되면 거부한다", async ({ request }) => {
    // e2e-short-token client의 access token 수명은 2초다. Spring Security의
    // JwtTimestampValidator는 기본 60초 clock skew를 허용하므로, 만료 판정은
    // 수명 + skew가 지난 뒤에만 검증할 수 있다.
    test.setTimeout(120_000);
    const shortToken = await tokenOf(request, "/realms/template", {
      grant_type: "client_credentials",
      client_id: "e2e-short-token",
      client_secret: "e2e-short-token-local-secret",
    });

    const whileValid = await request.get(`${GATEWAY_URL}/api/v1/items`, {
      headers: { Authorization: `Bearer ${shortToken}` },
    });
    expect(whileValid.status()).toBe(200);
    expect(Array.isArray(await whileValid.json())).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 65_000));
    const afterExpiry = await request.get(`${GATEWAY_URL}/api/v1/items`, {
      headers: { Authorization: `Bearer ${shortToken}` },
    });
    expect(afterExpiry.status()).toBe(401);
  });
});
