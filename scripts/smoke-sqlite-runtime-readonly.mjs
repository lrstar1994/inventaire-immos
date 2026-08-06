import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";

const port = 3000;
const nextRunner = path.resolve(process.cwd(), "scripts/run-next-with-database.mjs");
let output = "";

function waitForPort(timeoutMs = 60_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) {
          reject(new Error("SQLITE_RUNTIME_START_TIMEOUT"));
        } else {
          setTimeout(probe, 250);
        }
      });
    };
    probe();
  });
}

const child = spawn(process.execPath, [nextRunner, "sqlite", "start", "--port", String(port)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  await waitForPort();
  const cases = [
    ["/connexion", [200]],
    ["/", [307, 308]],
    ["/parc", [307, 308]],
    ["/documents", [307, 308]],
    ["/mouvements", [307, 308]],
    ["/referentiels", [307, 308]],
    ["/api/health", [200]],
    ["/api/asset-units", [401]]
  ];
  const checks = [];
  for (const [requestPath, expectedStatuses] of cases) {
    let response;
    try {
      response = await fetch(`http://127.0.0.1:${port}${requestPath}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(60_000)
      });
    } catch (error) {
      throw new Error(`HTTP_REQUEST_FAILED:${requestPath}:${error?.name || "Error"}`);
    }
    if (!expectedStatuses.includes(response.status)) {
      throw new Error(`UNEXPECTED_HTTP_STATUS:${requestPath}:${response.status}`);
    }
    checks.push({
      path: requestPath,
      status: response.status,
      redirectsInternally: response.headers.get("location")?.startsWith("/") ?? false
    });
  }
  console.log(JSON.stringify({
    result: "SQLITE_RUNTIME_READ_ONLY_SMOKE_OK",
    checks
  }, null, 2));
} catch (error) {
  const safeTail = output.split(/\r?\n/).filter(Boolean).slice(-10)
    .map((line) => line.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi, "[URL_MASQUÉE]"));
  console.error(JSON.stringify({
    result: "SQLITE_RUNTIME_READ_ONLY_SMOKE_FAILED",
    error: error?.message || "Error",
    safeOutputTail: safeTail
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
    child.kill("SIGTERM");
  }
}
