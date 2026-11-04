import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const state = await mkdtemp(join(tmpdir(), "daywork-e2e-"));
const cli = join(process.cwd(), "node_modules/wrangler/bin/wrangler.js");
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Wrangler exited ${code}`)),
    );
  });
try {
  await run([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--env",
    "local",
    "--local",
    "--persist-to",
    state,
  ]);
  const child = spawn(
    process.execPath,
    [cli, "dev", "--env", "local", "--port", "8788", "--persist-to", state],
    { stdio: "inherit" },
  );
  const stop = async () => {
    child.kill("SIGTERM");
    await rm(state, { recursive: true, force: true });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  await new Promise((resolve) => child.on("exit", resolve));
} finally {
  await rm(state, { recursive: true, force: true });
}
