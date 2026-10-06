import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const devDir = process.cwd();
const sdkPath = resolve(devDir, "src/lnbits-sdk.js");
const entryPath = resolve(devDir, "src/index.js");
const outPath = resolve(devDir, "dist/index.bundle.js");

const timezones = await readFile(resolve(devDir, "src/timezones.js"), "utf8");
const engine = await readFile(
  resolve(devDir, "../static/js/engine-city-7.js"),
  "utf8",
);
const sdk = await readFile(sdkPath, "utf8");
const entry = await readFile(entryPath, "utf8");

const bundledSdk = sdk.replace(/^export const /gm, "const ");
const bundledEntry = entry.replace(
  /^import\s+\{[^}]+\}\s+from\s+[\x22\x27]\.\/lnbits-sdk\.js[\x22\x27];?\s*/,
  "",
);

await mkdir(dirname(outPath), { recursive: true });
await writeFile(
  outPath,
  `${bundledSdk}\n\n${engine}\n\n${timezones}\n\n${bundledEntry}`,
  "utf8",
);
