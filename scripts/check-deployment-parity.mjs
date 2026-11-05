import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

// Build only: no upload, provider calls or credential access. Compare the executable
// that Wrangler would deploy, rather than assuming the common entry point is enough.
await mkdir(resolve(".local"), { recursive: true });
const temporary = await mkdtemp(resolve(".local/deployment-parity-"));
try {
  const hashes = [];
  for (const environment of ["", "staging"]) {
    const output = join(temporary, environment || "production");
    execFileSync(
      process.execPath,
      [
        resolve("node_modules/wrangler/bin/wrangler.js"),
        "deploy",
        "--dry-run",
        "--env",
        environment,
        "--outdir",
        output,
      ],
      { stdio: "pipe", timeout: 120000 },
    );
    hashes.push(
      createHash("sha256")
        .update(await readFile(join(output, "index.js")))
        .digest("hex"),
    );
  }
  if (hashes[0] !== hashes[1])
    throw new Error(
      "Staging and production Worker executables differ. Resolve the divergence before release.",
    );
  console.log(`Identical production/staging Worker SHA-256: ${hashes[0]}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
