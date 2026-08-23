import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const windowsBash = "C:\\Program Files\\Git\\bin\\bash.exe";
const bashExecutable = process.platform === "win32" ? windowsBash : "bash";

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${executable} failed\n${result.stdout}\n${result.stderr}`);
}

function runExpectingFailure(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" });
  assert.notEqual(result.status, 0, `${executable} unexpectedly succeeded\n${result.stdout}`);
  return `${result.stdout}\n${result.stderr}`;
}

function invalidConfig() {
  const config = configWith({});
  delete config.features.kafka;
  return config;
}

function configWith(features) {
  return {
    $schema: "./config/template-config.schema.json",
    project: { name: "contract-platform", basePackage: "com.acme.contract" },
    runtime: { java: 21, springBoot: "3.5.16", deploymentTarget: "kubernetes" },
    capacity: { targetTps: 100, availabilityTarget: "99.9", peakConcurrency: 100 },
    frontend: { mode: "none" },
    features: {
      database: "postgresql",
      readWriteSplit: false,
      redis: false,
      kafka: false,
      elasticsearch: false,
      oidc: false,
      observability: false,
      ...features,
    },
    environments: ["local", "dev", "prod"],
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "platform-generator-"));
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, "templates"), { recursive: true });
  await mkdir(path.join(root, "services"), { recursive: true });
  await mkdir(path.join(root, "config"), { recursive: true });
  await cp(path.join(repoRoot, "templates", "service-template"), path.join(root, "templates", "service-template"), { recursive: true });
  await cp(path.join(repoRoot, "templates", "service-features"), path.join(root, "templates", "service-features"), { recursive: true });
  for (const script of ["new-service.ps1", "new-service.sh", "apply-config.ps1"]) {
    await cp(path.join(repoRoot, "tools", script), path.join(root, "tools", script));
  }
  await cp(
    path.join(repoRoot, "tools", "lib", "validate-template-config.mjs"),
    path.join(root, "tools", "lib", "validate-template-config.mjs"),
  );
  await cp(
    path.join(repoRoot, "config", "template-config.schema.json"),
    path.join(root, "config", "template-config.schema.json"),
  );
  return root;
}

async function assertSelectedService(root, serviceName) {
  const serviceRoot = path.join(root, "services", serviceName);
  const build = await readFile(path.join(serviceRoot, "build.gradle"), "utf8");
  const application = await readFile(path.join(serviceRoot, "src", "main", "resources", "application.yml"), "utf8");
  assert.match(build, /platform-starter-security/);
  assert.match(build, /platform-starter-observability/);
  assert.doesNotMatch(build, /platform-starter-redis/);
  assert.doesNotMatch(build, /platform-starter-kafka/);
  assert.doesNotMatch(build, /platform-starter-search/);
  assert.match(application, /config:\r?\n\s{4}import:\r?\n/);
  assert.match(application, /classpath:application-platform-security\.yml/);
  assert.match(application, /classpath:application-platform-observability\.yml/);
  assert.ok(existsSync(path.join(serviceRoot, "src", "main", "resources", "application-platform-security.yml")));
  assert.ok(existsSync(path.join(serviceRoot, "src", "main", "resources", "application-platform-observability.yml")));
}

test("PowerShell generator applies OIDC and observability selections", async () => {
  const root = await fixture();
  try {
    const configPath = path.join(root, "selected.json");
    await writeFile(configPath, JSON.stringify(configWith({ oidc: true, observability: true })), "utf8");
    run("pwsh", ["-NoProfile", "-File", path.join(root, "tools", "new-service.ps1"), "-Name", "selected-service", "-BasePackage", "com.acme.selected", "-ConfigPath", configPath], root);
    await assertSelectedService(root, "selected-service");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Bash generator applies the same feature selections", { skip: process.platform === "win32" && !existsSync(windowsBash) }, async () => {
  const root = await fixture();
  try {
    const configPath = path.join(root, "selected.json");
    await writeFile(configPath, JSON.stringify(configWith({ oidc: true, observability: true })), "utf8");
    run(bashExecutable, [path.join(root, "tools", "new-service.sh"), "selected-service", "com.acme.selected", configPath], root);
    await assertSelectedService(root, "selected-service");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PowerShell generator rejects a configuration that violates the schema", async () => {
  const root = await fixture();
  try {
    const configPath = path.join(root, "invalid.json");
    await writeFile(configPath, JSON.stringify(invalidConfig()), "utf8");
    runExpectingFailure("pwsh", ["-NoProfile", "-File", path.join(root, "tools", "new-service.ps1"), "-Name", "invalid-service", "-BasePackage", "com.acme.invalid", "-ConfigPath", configPath], root);
    assert.equal(existsSync(path.join(root, "services", "invalid-service")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Bash generator rejects the same invalid configuration with schema errors", { skip: process.platform === "win32" && !existsSync(windowsBash) }, async () => {
  const root = await fixture();
  try {
    const configPath = path.join(root, "invalid.json");
    await writeFile(configPath, JSON.stringify(invalidConfig()), "utf8");
    const output = runExpectingFailure(bashExecutable, [path.join(root, "tools", "new-service.sh"), "invalid-service", "com.acme.invalid", configPath], root);
    assert.match(output, /features\.kafka/);
    assert.match(output, /does not match/);
    assert.equal(existsSync(path.join(root, "services", "invalid-service")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("configuration application emits every runtime feature switch", async () => {
  const root = await fixture();
  try {
    const configPath = path.join(root, "template-config.json");
    await writeFile(configPath, JSON.stringify(configWith({ redis: true, oidc: true, observability: true })), "utf8");
    run("pwsh", ["-NoProfile", "-File", path.join(root, "tools", "apply-config.ps1"), "-ConfigPath", configPath], root);
    const environment = await readFile(path.join(root, "generated", "application-features.env"), "utf8");
    assert.match(environment, /^REDIS_ENABLED=true$/m);
    assert.match(environment, /^KAFKA_ENABLED=false$/m);
    assert.match(environment, /^SECURITY_ENABLED=true$/m);
    assert.match(environment, /^GATEWAY_SECURITY_ENABLED=true$/m);
    assert.match(environment, /^OBSERVABILITY_ENABLED=true$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prod configuration contains no local endpoints, local passwords, or disabled security defaults", async () => {
  const files = [
    path.join(repoRoot, "services", "sample-service", "src", "main", "resources", "application-prod.yml"),
    path.join(repoRoot, "services", "gateway-service", "src", "main", "resources", "application-prod.yml"),
    ...["redis.yml", "kafka.yml", "search.yml", "security.yml"].map((name) => path.join(repoRoot, "templates", "service-features", name)),
  ];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const prodDocuments = contents
      .split(/^---\s*$/m)
      .filter((document) => file.endsWith("application-prod.yml") || /on-profile:\s*prod/.test(document));
    for (const document of prodDocuments) {
      assert.doesNotMatch(document, /localhost|127\.0\.0\.1|local-password/i, file);
      assert.doesNotMatch(document, /security-enabled:\s*false|security:\s*\n\s*enabled:\s*false/i, file);
    }
  }
});
