import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const validatorPath = path.join(repoRoot, "tools", "lib", "validate-template-config.mjs");
const schemaPath = path.join(repoRoot, "config", "template-config.schema.json");

function validConfig() {
  return {
    project: { name: "validator-check", basePackage: "com.acme.validator" },
    runtime: { java: 21, springBoot: "3.5.16", deploymentTarget: "kubernetes" },
    capacity: { targetTps: 100, availabilityTarget: "99.9", peakConcurrency: 100 },
    frontend: { mode: "none" },
    features: {
      database: "postgresql",
      readWriteSplit: false,
      redis: true,
      kafka: false,
      elasticsearch: false,
      oidc: true,
      observability: false,
    },
    environments: ["local", "dev", "prod"],
  };
}

async function runValidator(config, extraArgs = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), "template-config-validator-"));
  try {
    const configPath = path.join(root, "config.json");
    await writeFile(configPath, JSON.stringify(config), "utf8");
    return spawnSync(process.execPath, [validatorPath, configPath, schemaPath, ...extraArgs], { encoding: "utf8" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("valid configuration passes and prints boolean feature flags", async () => {
  const result = await runValidator(validConfig(), ["--features"]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.ok(lines.includes("redis=true"));
  assert.ok(lines.includes("kafka=false"));
  assert.ok(lines.includes("oidc=true"));
  assert.ok(!lines.some((line) => line.startsWith("database=")));
});

test("missing required property is rejected with its path", async () => {
  const config = validConfig();
  delete config.features.kafka;
  const result = await runValidator(config);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\$\.features\.kafka: required property is missing/);
});

test("wrong type, const, enum, and pattern violations are all reported", async () => {
  const config = validConfig();
  config.features.redis = "yes";
  config.runtime.java = 17;
  config.runtime.deploymentTarget = "bare-metal";
  config.project.name = "Invalid_Name";
  const result = await runValidator(config);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\$\.features\.redis: must be of type boolean/);
  assert.match(result.stderr, /\$\.runtime\.java: must be 21/);
  assert.match(result.stderr, /\$\.runtime\.deploymentTarget: must be one of/);
  assert.match(result.stderr, /\$\.project\.name: must match pattern/);
});

test("unknown properties and invalid environments are rejected", async () => {
  const config = validConfig();
  config.features.mongodb = true;
  config.environments = ["local", "local"];
  const result = await runValidator(config);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\$\.features\.mongodb: property is not allowed/);
  assert.match(result.stderr, /\$\.environments: items must be unique/);
});

test("numeric bounds are enforced", async () => {
  const config = validConfig();
  config.capacity.targetTps = 0;
  const result = await runValidator(config);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\$\.capacity\.targetTps: must be >= 1/);
});

test("malformed JSON fails with a readable message", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "template-config-validator-"));
  try {
    const configPath = path.join(root, "config.json");
    await writeFile(configPath, "{ not json", "utf8");
    const result = spawnSync(process.execPath, [validatorPath, configPath, schemaPath], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not valid JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validator accepts the repository example configuration if present", async () => {
  const examplePath = path.join(repoRoot, "template-config.json");
  let example;
  try {
    example = JSON.parse(await readFile(examplePath, "utf8"));
  } catch {
    return; // No example configuration in this checkout.
  }
  const result = await runValidator(example);
  assert.equal(result.status, 0, result.stderr);
});
