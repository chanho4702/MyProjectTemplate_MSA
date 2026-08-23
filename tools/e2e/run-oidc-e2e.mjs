#!/usr/bin/env node
// Boots an isolated full stack (PostgreSQL + Keycloak + sample-service +
// gateway-service + SPA preview) on dedicated ports and runs the real-IdP
// browser E2E in apps/web/e2e-oidc. Requires Docker, Java 21, pnpm and an
// installed Playwright Chromium. Nothing here touches the default local
// stack: containers, ports, realm file and database are all E2E-specific.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStackRunner } from "./lib/stack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = path.join(repoRoot, "apps", "web");
const runner = createStackRunner({ repoRoot, label: "oidc-e2e" });

const PORTS = {
  postgres: Number(process.env.OIDC_E2E_POSTGRES_PORT ?? 15432),
  keycloak: Number(process.env.OIDC_E2E_KEYCLOAK_PORT ?? 18180),
  sample: Number(process.env.OIDC_E2E_SAMPLE_PORT ?? 18081),
  gateway: Number(process.env.OIDC_E2E_GATEWAY_PORT ?? 18082),
  web: Number(process.env.OIDC_E2E_WEB_PORT ?? 14173),
};
const CONTAINERS = {
  postgres: "oidc-e2e-postgres",
  keycloak: "oidc-e2e-keycloak",
};
const KEYCLOAK_URL = `http://localhost:${PORTS.keycloak}`;
const ISSUER = `${KEYCLOAK_URL}/realms/template`;
const GATEWAY_URL = `http://127.0.0.1:${PORTS.gateway}`;
const WEB_URL = `http://127.0.0.1:${PORTS.web}`;

// Derives an E2E-only realm from the shared local realm: the shared file keeps
// its normal token lifetimes for developers, while the E2E copy shortens them
// so refresh and expiry can be observed within one test run.
async function writeDerivedRealm(directory) {
  const realm = JSON.parse(await readFile(path.join(repoRoot, "infra", "keycloak", "realm-template.json"), "utf8"));
  const spa = realm.clients.find((client) => client.clientId === "template-spa");
  if (!spa) runner.fail("realm-template.json no longer defines the template-spa client.");
  const origins = [`http://localhost:${PORTS.web}`, `http://127.0.0.1:${PORTS.web}`];
  for (const origin of origins) {
    spa.redirectUris.push(`${origin}/`, `${origin}/oidc/callback`, `${origin}/oidc/logout-callback`);
    spa.webOrigins.push(origin);
  }
  spa.attributes["post.logout.redirect.uris"] = [
    spa.attributes["post.logout.redirect.uris"],
    ...origins.map((origin) => `${origin}/oidc/logout-callback`),
  ].join("##");
  spa.attributes["access.token.lifespan"] = "20";
  realm.clients.push({
    clientId: "e2e-short-token",
    name: "E2E expired-token probe client",
    enabled: true,
    clientAuthenticatorType: "client-secret",
    secret: "e2e-short-token-local-secret",
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
    directAccessGrantsEnabled: false,
    publicClient: false,
    protocol: "openid-connect",
    attributes: { "access.token.lifespan": "2" },
  });
  const realmPath = path.join(directory, "realm-e2e.json");
  await writeFile(realmPath, JSON.stringify(realm, null, 2), "utf8");
  return realmPath;
}

function removeContainers() {
  for (const name of Object.values(CONTAINERS)) {
    runner.docker(["rm", "-f", name]);
  }
}

let workDirectory;

async function main() {
  if (runner.docker(["info"]).status !== 0) {
    runner.fail("Docker is not available. Start Docker Desktop (or the Docker daemon) first.");
  }
  for (const [portLabel, port] of Object.entries(PORTS)) {
    await runner.assertPortFree(port, portLabel);
  }

  workDirectory = await mkdtemp(path.join(os.tmpdir(), "oidc-e2e-"));
  runner.setWorkDirectory(workDirectory);
  const images = await runner.readImageVersions();
  if (!images.POSTGRES_IMAGE || !images.KEYCLOAK_IMAGE) {
    runner.fail("infra/.env.versions must define POSTGRES_IMAGE and KEYCLOAK_IMAGE.");
  }
  const realmPath = await writeDerivedRealm(workDirectory);
  removeContainers();

  runner.log("starting PostgreSQL container...");
  const postgres = runner.docker([
    "run", "-d", "--rm", "--name", CONTAINERS.postgres,
    "-p", `127.0.0.1:${PORTS.postgres}:5432`,
    "-e", "POSTGRES_DB=appdb",
    "-e", "POSTGRES_USER=app",
    "-e", "POSTGRES_PASSWORD=app-local-password",
    images.POSTGRES_IMAGE,
  ]);
  if (postgres.status !== 0) runner.fail(`PostgreSQL container failed to start:\n${postgres.stderr}`);

  runner.log("starting Keycloak container with the derived E2E realm...");
  const keycloak = runner.docker([
    "run", "-d", "--rm", "--name", CONTAINERS.keycloak,
    "-p", `127.0.0.1:${PORTS.keycloak}:8080`,
    "-v", `${realmPath}:/opt/keycloak/data/import/realm-e2e.json:ro`,
    "-e", "KC_BOOTSTRAP_ADMIN_USERNAME=admin",
    "-e", "KC_BOOTSTRAP_ADMIN_PASSWORD=admin-local-password",
    images.KEYCLOAK_IMAGE,
    "start-dev", "--import-realm",
  ]);
  if (keycloak.status !== 0) runner.fail(`Keycloak container failed to start:\n${keycloak.stderr}`);

  await runner.waitFor(
    "PostgreSQL",
    () => runner.docker(["exec", CONTAINERS.postgres, "pg_isready", "-U", "app", "-d", "appdb"]).status === 0,
    120_000,
  );
  await runner.waitFor("Keycloak realm", () => runner.httpOk(`${ISSUER}/.well-known/openid-configuration`), 300_000);

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
    GATEWAY_SECURITY_ENABLED: "true",
    SAMPLE_SERVICE_URI: `http://localhost:${PORTS.sample}`,
    SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI: ISSUER,
  });
  runner.startProcess("gateway-service", gateway.executable, gateway.args, gateway.options);
  await runner.waitFor("gateway-service", () => runner.httpOk(`${GATEWAY_URL}/actuator/health`), 300_000);

  runner.runSyncOrFail("building the SPA", runner.pnpmCommand(webRoot, ["exec", "vite", "build"]));
  const preview = runner.pnpmCommand(
    webRoot,
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(PORTS.web), "--strictPort"],
    { GATEWAY_PROXY_TARGET: GATEWAY_URL },
  );
  runner.startProcess("web-preview", preview.executable, preview.args, preview.options);
  await runner.waitFor("SPA preview", () => runner.httpOk(`${WEB_URL}/`), 120_000);

  runner.runSyncOrFail(
    "running the OIDC browser E2E",
    runner.pnpmCommand(webRoot, ["exec", "playwright", "test", "--config", "playwright.oidc.config.ts"], {
      OIDC_E2E_WEB_URL: WEB_URL,
      OIDC_E2E_KEYCLOAK_URL: KEYCLOAK_URL,
      OIDC_E2E_GATEWAY_URL: GATEWAY_URL,
    }),
  );
  runner.log("OIDC E2E finished successfully.");
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  if (!process.exitCode) process.exitCode = 1;
  console.error(`[oidc-e2e] ${error.message}`);
} finally {
  if (failed) await runner.printLogTails();
  runner.stopProcesses();
  removeContainers();
  if (workDirectory && !process.env.OIDC_E2E_KEEP_WORKDIR) {
    // Log streams may close a moment after taskkill; tolerate EBUSY here.
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
