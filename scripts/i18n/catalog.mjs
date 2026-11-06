import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { labels } from "./labels.mjs";
import { collect, errorCopy } from "./extract.mjs";
const path = "src/shared/messages.json";
const extras = Object.fromEntries(
  labels.map((value) => [
    createHash("sha256").update(value).digest("hex").slice(0, 16),
    value,
  ]),
);
const result =
  JSON.stringify(
    {
      ...collect("src/client"),
      ...errorCopy("src/server"),
      ...errorCopy("src/client"),
      ...extras,
    },
    null,
    2,
  ) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== result)
    throw Error("Update the catalog with npm run i18n:extract");
} else writeFileSync(path, result);
