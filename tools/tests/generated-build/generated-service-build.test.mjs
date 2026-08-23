// Generates real services for the none / single-feature / all-feature
// selections, checks generator output contracts, compares PowerShell and Bash
// results, and builds every generated service with the repository Gradle
// toolchain (Java 21 required). Run with: pnpm tools:test:generated-build
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const servicesRoot = path.join(repoRoot, "services");
const windowsBash = "C:\\Program Files\\Git\\bin\\bash.exe";
const bashExecutable = process.platform === "win32" ? windowsBash : "bash";
const bashAvailable = process.platform === "win32" ? existsSync(windowsBash) : true;
const pwshAvailable = spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" }).status === 0;

const FEATURES = {
  redis: { starter: "platform-starter-redis", config: "application-platform-redis.yml" },
  kafka: { starter: "platform-starter-kafka", config: "application-platform-kafka.yml" },
  elasticsearch: { starter: "platform-starter-search", config: "application-platform-search.yml" },
  oidc: { starter: "platform-starter-security", config: "application-platform-security.yml" },
  observability: { starter: "platform-starter-observability", config: "application-platform-observability.yml" },
};
const COMBOS = [
  { key: "none", enabled: [] },
  ...Object.keys(FEATURES).map((feature) => ({ key: feature, enabled: [feature] })),
  { key: "all", enabled: Object.keys(FEATURES) },
];
const PLACEHOLDER_PATTERN = /__(SERVICE_NAME|BASE_PACKAGE|CLASS_NAME|PACKAGE_PATH|OPTIONAL_STARTERS|OPTIONAL_CONFIG_IMPORTS)__/;

function configFor(enabled) {
  return {
    project: { name: "genchk-platform", basePackage: "com.acme.genchk" },
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
      ...Object.fromEntries(enabled.map((feature) => [feature, true])),
    },
    environments: ["local", "dev", "prod"],
  };
}

function serviceName(generator, comboKey) {
  return `genchk-${generator}-${comboKey}`;
}

function classNameFor(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: repoRoot, encoding: "utf8", ...options });
  assert.equal(result.status, 0, `${executable} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}

async function removeGeneratedServices() {
  const entries = await readdir(servicesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("genchk-")) {
      await rm(path.join(servicesRoot, entry.name), { recursive: true, force: true });
    }
  }
}

async function collectFiles(root, relative = "") {
  const files = new Map();
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [key, value] of await collectFiles(root, childRelative)) {
        files.set(key, value);
      }
    } else {
      const contents = await readFile(path.join(root, relative, entry.name), "utf8");
      files.set(childRelative, contents.replace(/\r\n/g, "\n"));
    }
  }
  return files;
}

async function assertGeneratedService(generator, combo) {
  const name = serviceName(generator, combo.key);
  const serviceRoot = path.join(servicesRoot, name);
  const files = await collectFiles(serviceRoot);
  assert.ok(files.size > 0, `${name}: no files were generated`);

  for (const [relativePath, contents] of files) {
    assert.doesNotMatch(contents, PLACEHOLDER_PATTERN, `${name}/${relativePath} still contains template placeholders`);
    assert.doesNotMatch(relativePath, /__/, `${name}/${relativePath} still contains a placeholder path segment`);
  }

  const build = files.get("build.gradle");
  const application = files.get("src/main/resources/application.yml");
  const className = classNameFor(name);
  assert.ok(files.has(`src/main/java/com/acme/gen${combo.key}/${className}Application.java`), `${name}: application class missing`);
  assert.ok(files.has(`src/test/java/com/acme/gen${combo.key}/${className}ApplicationTest.java`), `${name}: application test missing`);

  for (const [feature, artifacts] of Object.entries(FEATURES)) {
    const selected = combo.enabled.includes(feature);
    assert.equal(
      build.includes(`:starters:${artifacts.starter}`),
      selected,
      `${name}: ${artifacts.starter} dependency should ${selected ? "" : "not "}be present`,
    );
    assert.equal(
      files.has(`src/main/resources/${artifacts.config}`),
      selected,
      `${name}: ${artifacts.config} should ${selected ? "" : "not "}exist`,
    );
    assert.equal(
      application.includes(`classpath:${artifacts.config}`),
      selected,
      `${name}: application.yml import of ${artifacts.config} should ${selected ? "" : "not "}be present`,
    );
  }
  if (combo.enabled.length > 0) {
    assert.match(application, /\n {2}config:\n {4}import:\n/, `${name}: spring.config.import block is malformed`);
  } else {
    assert.doesNotMatch(application, /config:\n {4}import:/, `${name}: unexpected spring.config.import block`);
  }
  return files;
}

test("generated services satisfy contracts and build on Java 21", async (t) => {
  assert.ok(
    pwshAvailable || bashAvailable,
    "Neither pwsh nor bash is available; the generated-service build contract cannot run.",
  );

  const configRoot = await mkdtemp(path.join(os.tmpdir(), "genchk-configs-"));
  await removeGeneratedServices();
  try {
    for (const combo of COMBOS) {
      const configPath = path.join(configRoot, `${combo.key}.json`);
      await writeFile(configPath, JSON.stringify(configFor(combo.enabled)), "utf8");
      if (pwshAvailable) {
        run("pwsh", [
          "-NoProfile",
          "-File",
          path.join(repoRoot, "tools", "new-service.ps1"),
          "-Name",
          serviceName("ps", combo.key),
          "-BasePackage",
          `com.acme.gen${combo.key}`,
          "-ConfigPath",
          configPath,
        ]);
      }
      if (bashAvailable) {
        run(bashExecutable, [
          path.join(repoRoot, "tools", "new-service.sh"),
          serviceName("sh", combo.key),
          `com.acme.gen${combo.key}`,
          configPath,
        ]);
      }
    }

    const filesByGenerator = new Map();
    await t.test("generated files keep the selection contract", async () => {
      for (const combo of COMBOS) {
        if (pwshAvailable) {
          filesByGenerator.set(`ps:${combo.key}`, await assertGeneratedService("ps", combo));
        }
        if (bashAvailable) {
          filesByGenerator.set(`sh:${combo.key}`, await assertGeneratedService("sh", combo));
        }
      }
    });

    await t.test("PowerShell and Bash outputs are equivalent", { skip: !(pwshAvailable && bashAvailable) }, () => {
      for (const combo of COMBOS) {
        const normalized = (generator) => {
          const name = serviceName(generator, combo.key);
          const className = classNameFor(name);
          const files = new Map();
          for (const [relativePath, contents] of filesByGenerator.get(`${generator}:${combo.key}`)) {
            files.set(
              relativePath.replaceAll(className, "__CLASS__"),
              contents.replaceAll(className, "__CLASS__").replaceAll(name, "__NAME__"),
            );
          }
          return files;
        };
        const psFiles = normalized("ps");
        const shFiles = normalized("sh");
        assert.deepEqual([...psFiles.keys()].sort(), [...shFiles.keys()].sort(), `${combo.key}: file lists differ`);
        for (const [relativePath, psContents] of psFiles) {
          assert.equal(psContents, shFiles.get(relativePath), `${combo.key}: ${relativePath} differs between generators`);
        }
      }
    });

    await t.test("every generated combination builds with Gradle", () => {
      const buildGenerator = pwshAvailable ? "ps" : "sh";
      const tasks = COMBOS.map((combo) => `:services:${serviceName(buildGenerator, combo.key)}:test`);
      const environment = { ...process.env };
      if (process.env.GENERATED_BUILD_JAVA_HOME) {
        environment.JAVA_HOME = process.env.GENERATED_BUILD_JAVA_HOME;
      }
      const gradle =
        process.platform === "win32"
          ? { executable: "cmd.exe", args: ["/c", path.join(repoRoot, "gradlew.bat"), ...tasks, "--console=plain"] }
          : { executable: "./gradlew", args: [...tasks, "--console=plain"] };
      run(gradle.executable, gradle.args, { env: environment });
    });
  } finally {
    await removeGeneratedServices();
    await rm(configRoot, { recursive: true, force: true });
  }
});
