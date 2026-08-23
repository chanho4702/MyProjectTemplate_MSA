#!/usr/bin/env node
// Builds the apps/web production image, boots an isolated
// container(web) → ingress(nginx) → Gateway → sample-service → PostgreSQL
// stack on dedicated ports, and runs the browser smoke in apps/web/e2e-image
// (desktop Chromium, mobile viewport, Firefox). Requires Docker, Java 21,
// pnpm and installed Playwright browsers. The default local stack is not
// touched. Run with: pnpm web:image:smoke
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStackRunner } from "./lib/stack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = path.join(repoRoot, "apps", "web");
const runner = createStackRunner({ repoRoot, label: "image-smoke" });

const PORTS = {
  postgres: Number(process.env.FRONTEND_SMOKE_POSTGRES_PORT ?? 25432),
  sample: Number(process.env.FRONTEND_SMOKE_SAMPLE_PORT ?? 28081),
  gateway: Number(process.env.FRONTEND_SMOKE_GATEWAY_PORT ?? 28082),
  ingress: Number(process.env.FRONTEND_SMOKE_INGRESS_PORT ?? 28090),
  webAlt: Number(process.env.FRONTEND_SMOKE_ALT_PORT ?? 28091),
};
const COMPOSE_PROJECT = "frontend-smoke";
const ALT_CONTAINER = "frontend-smoke-web-alt";
const POSTGRES_CONTAINER = "frontend-smoke-postgres";
const INGRESS_URL = `http://127.0.0.1:${PORTS.ingress}`;
const ALT_WEB_URL = `http://127.0.0.1:${PORTS.webAlt}`;

function composeArgs(...args) {
  return [
    "compose",
    "--env-file", path.join(repoRoot, "infra", ".env.versions"),
    "-f", path.join(repoRoot, "infra", "compose.yml"),
    "-p", COMPOSE_PROJECT,
    "--profile", "frontend",
    ...args,
  ];
}

function composeEnvironment() {
  return {
    ...process.env,
    GATEWAY_PORT: String(PORTS.gateway),
    FRONTEND_INGRESS_PORT: String(PORTS.ingress),
  };
}

function removeContainers() {
  runner.docker(["rm", "-f", ALT_CONTAINER, POSTGRES_CONTAINER]);
  runner.docker(composeArgs("down", "--remove-orphans"), { env: composeEnvironment() });
}

let workDirectory;

async function main() {
  if (runner.docker(["info"]).status !== 0) {
    runner.fail("Docker is not available. Start Docker Desktop (or the Docker daemon) first.");
  }
  for (const [portLabel, port] of Object.entries(PORTS)) {
    await runner.assertPortFree(port, portLabel);
  }

  workDirectory = await mkdtemp(path.join(os.tmpdir(), "frontend-smoke-"));
  runner.setWorkDirectory(workDirectory);
  const images = await runner.readImageVersions();
  removeContainers();

  // 같은 이미지 재사용 검증용: 두 번째 container에 mount할 다른 환경 설정.
  const altConfigPath = path.join(workDirectory, "app-config.alt.json");
  await writeFile(altConfigPath, JSON.stringify({ environment: "dev", apiBaseUrl: "", auth: { enabled: false } }), "utf8");

  runner.log("starting PostgreSQL container...");
  const postgres = runner.docker([
    "run", "-d", "--rm", "--name", POSTGRES_CONTAINER,
    "-p", `127.0.0.1:${PORTS.postgres}:5432`,
    "-e", "POSTGRES_DB=appdb",
    "-e", "POSTGRES_USER=app",
    "-e", "POSTGRES_PASSWORD=app-local-password",
    images.POSTGRES_IMAGE,
  ]);
  if (postgres.status !== 0) runner.fail(`PostgreSQL container failed to start:\n${postgres.stderr}`);
  await runner.waitFor(
    "PostgreSQL",
    () => runner.docker(["exec", POSTGRES_CONTAINER, "pg_isready", "-U", "app", "-d", "appdb"]).status === 0,
    120_000,
  );

  const sample = runner.gradleBootRun(":services:sample-service:bootRun", {
    SERVER_PORT: String(PORTS.sample),
    DB_WRITER_URL: `jdbc:postgresql://localhost:${PORTS.postgres}/appdb`,
    DB_USERNAME: "app",
    DB_PASSWORD: "app-local-password",
  });
  runner.startProcess("sample-service", sample.executable, sample.args, sample.options);
  await runner.waitFor("sample-service", () => runner.httpOk(`http://127.0.0.1:${PORTS.sample}/actuator/health`), 300_000);

  const gateway = runner.gradleBootRun(":services:gateway-service:bootRun", {
    SERVER_PORT: String(PORTS.gateway),
    SAMPLE_SERVICE_URI: `http://localhost:${PORTS.sample}`,
  });
  runner.startProcess("gateway-service", gateway.executable, gateway.args, gateway.options);
  await runner.waitFor("gateway-service", () => runner.httpOk(`http://127.0.0.1:${PORTS.gateway}/actuator/health`), 300_000);

  runner.log("building the web image and starting web + ingress via compose...");
  const composeUp = runner.docker(composeArgs("up", "-d", "--build", "--wait", "web", "frontend-ingress"), {
    env: composeEnvironment(),
    stdio: "inherit",
    encoding: undefined,
  });
  if (composeUp.status !== 0) runner.fail("docker compose up for the frontend profile failed.");
  await runner.waitFor("frontend ingress", () => runner.httpOk(`${INGRESS_URL}/ingress-health`), 120_000);

  runner.log("starting a second web container from the same image with a different app-config...");
  const altWeb = runner.docker([
    "run", "-d", "--rm", "--name", ALT_CONTAINER,
    "-p", `127.0.0.1:${PORTS.webAlt}:8080`,
    "-v", `${altConfigPath}:/etc/msa-web/app-config.json:ro`,
    "msa-platform-web:local",
  ]);
  if (altWeb.status !== 0) runner.fail(`second web container failed to start:\n${altWeb.stderr}`);
  await runner.waitFor("second web container", () => runner.httpOk(`${ALT_WEB_URL}/healthz`), 120_000);

  runner.runSyncOrFail("installing Playwright Firefox", runner.pnpmCommand(webRoot, ["exec", "playwright", "install", "firefox"]));
  runner.runSyncOrFail(
    "running the production image smoke",
    runner.pnpmCommand(webRoot, ["exec", "playwright", "test", "--config", "playwright.image.config.ts"], {
      FRONTEND_SMOKE_URL: INGRESS_URL,
      FRONTEND_SMOKE_ALT_URL: ALT_WEB_URL,
    }),
  );
  runner.log("frontend image smoke finished successfully.");
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  if (!process.exitCode) process.exitCode = 1;
  console.error(`[image-smoke] ${error.message}`);
} finally {
  if (failed) await runner.printLogTails();
  runner.stopProcesses();
  removeContainers();
  if (workDirectory && !process.env.FRONTEND_SMOKE_KEEP_WORKDIR) {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
