import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  fs.readFileSync(path.join(root, "src/lib/trial-sync-version.json"), "utf8"),
).version;

function replaceVersion(filePath, replacements) {
  const absolutePath = path.join(root, filePath);
  let contents = fs.readFileSync(absolutePath, "utf8");
  for (const [pattern, replacement] of replacements) {
    contents = contents.replace(pattern, replacement);
  }
  fs.writeFileSync(absolutePath, contents);
}

replaceVersion("public/ironwood-trial-sync.user.js", [
  [/\/\/ @version\s+\S+/, `// @version      ${version}`],
  [/var SCRIPT_VERSION = "[^"]+";/, `var SCRIPT_VERSION = "${version}";`],
]);

replaceVersion("public/ironwood-trial-sync.js", [
  [
    /var SCRIPT_VERSION =\s*\n\s*\(scriptUrl && scriptUrl\.searchParams\.get\("v"\)\) \|\| "[^"]+";/,
    `var SCRIPT_VERSION =\n    (scriptUrl && scriptUrl.searchParams.get("v")) || "${version}";`,
  ],
]);

console.log(`Synced trial sync helper version to ${version}`);
