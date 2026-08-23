// Shared helpers for the E2E stack orchestrators (run-oidc-e2e.mjs,
// run-frontend-image-smoke.mjs). Each runner boots an isolated set of
// containers and host processes on dedicated ports and must clean up fully.
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

export function createStackRunner({ repoRoot, label }) {
  const children = [];
  let workDirectory;

  const log = (message) => console.log(`[${label}] ${message}`);

  function fail(message) {
    console.error(`[${label}] ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }

  function docker(args, options = {}) {
    return spawnSync("docker", args, { encoding: "utf8", ...options });
  }

  async function assertPortFree(port, portLabel) {
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.1", port, family: 4 }, () => {
        socket.destroy();
        reject(
          new Error(`Port ${port} (${portLabel}) is already in use. Stop the process using it or override the port env.`),
        );
      });
      socket.on("error", () => resolve(undefined));
      socket.setTimeout(1_000, () => {
        socket.destroy();
        resolve(undefined);
      });
    });
  }

  async function waitFor(waitLabel, probe, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await probe()) {
          log(`${waitLabel} is ready.`);
          return;
        }
      } catch {
        // Probe failures mean "not ready yet".
      }
      if (Date.now() > deadline) {
        fail(`${waitLabel} did not become ready within ${Math.round(timeoutMs / 1000)}s.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  async function httpOk(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  }

  async function readImageVersions() {
    const raw = await readFile(path.join(repoRoot, "infra", ".env.versions"), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line.includes("="))
        .map((line) => line.split("=", 2)),
    );
  }

  function setWorkDirectory(directory) {
    workDirectory = directory;
  }

  function startProcess(processLabel, executable, args, options) {
    const logPath = path.join(workDirectory, `${processLabel}.log`);
    const output = createWriteStream(logPath);
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: !isWindows,
      ...options,
    });
    child.stdout.pipe(output);
    child.stderr.pipe(output);
    children.push({ label: processLabel, child, logPath });
    log(`${processLabel} started (pid ${child.pid}, log ${logPath}).`);
    return child;
  }

  function stopProcesses() {
    for (const { label: processLabel, child } of [...children].reverse()) {
      if (child.exitCode !== null) continue;
      log(`stopping ${processLabel}...`);
      try {
        if (isWindows) {
          spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { encoding: "utf8" });
        } else {
          process.kill(-child.pid, "SIGTERM");
        }
      } catch {
        // Already gone.
      }
    }
  }

  function gradleBootRun(task, environment) {
    const args = [task, "--args=--spring.profiles.active=local"];
    const env = { ...process.env, ...environment };
    if (process.env.OIDC_E2E_JAVA_HOME) env.JAVA_HOME = process.env.OIDC_E2E_JAVA_HOME;
    if (isWindows) {
      return { executable: "cmd.exe", args: ["/c", path.join(repoRoot, "gradlew.bat"), ...args], options: { cwd: repoRoot, env } };
    }
    return { executable: "./gradlew", args, options: { cwd: repoRoot, env } };
  }

  function pnpmCommand(cwd, args, environment = {}) {
    const env = { ...process.env, ...environment };
    if (isWindows) {
      return { executable: "cmd.exe", args: ["/c", "pnpm", ...args], options: { cwd, env } };
    }
    return { executable: "pnpm", args, options: { cwd, env } };
  }

  function runSyncOrFail(stepLabel, { executable, args, options }) {
    log(`${stepLabel}...`);
    const result = spawnSync(executable, args, { stdio: "inherit", ...options });
    if (result.status !== 0) fail(`${stepLabel} failed with exit code ${result.status}.`);
  }

  async function printLogTails() {
    for (const { label: processLabel, logPath } of children) {
      try {
        const contents = await readFile(logPath, "utf8");
        const tail = contents.split(/\r?\n/).slice(-25).join("\n");
        console.error(`\n[${label}] last output of ${processLabel} (${logPath}):\n${tail}`);
      } catch {
        // Log file may not exist if the process never started.
      }
    }
  }

  return {
    log,
    fail,
    docker,
    assertPortFree,
    waitFor,
    httpOk,
    readImageVersions,
    setWorkDirectory,
    startProcess,
    stopProcesses,
    gradleBootRun,
    pnpmCommand,
    runSyncOrFail,
    printLogTails,
  };
}
