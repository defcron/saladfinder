import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Run npm run build first. Keep old hashed assets for already-open browser tabs.
const destination = resolve(".local/sites-frontend");
await mkdir(`${destination}/.openai`, { recursive: true });
const manifest = {
  project_id: "appgprj_6aebb054ec9081918311eca3ede0063e",
  static: { directory: "dist" },
};
try {
  const existing = JSON.parse(await readFile(`${destination}/.openai/hosting.json`, "utf8"));
  if (existing.project_id !== manifest.project_id) throw new Error("Different Sites project in destination");
  Object.assign(manifest, existing);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await writeFile(`${destination}/.openai/hosting.json`, JSON.stringify(manifest, null, 2) + "\n");
await cp("dist", `${destination}/dist`, { recursive: true });
await cp("dist/index.html", `${destination}/dist/404.html`);
await cp("LICENSE", `${destination}/LICENSE`);
console.log(`Prepared Sites frontend: ${destination}`);
