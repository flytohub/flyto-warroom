import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ceRoot = dirname(fileURLToPath(import.meta.url));

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return [path];
    }),
  );
  return nested.flat();
}

const files = (await sourceFiles(ceRoot)).filter((path) =>
  [".ts", ".tsx", ".css"].includes(extname(path)),
);
const sources = await Promise.all(
  files.map(async (path) => [path, await readFile(path, "utf8")]),
);
const joined = sources.map(([, source]) => source).join("\n");
const app = await readFile(join(ceRoot, "App.tsx"), "utf8");
const styles = await readFile(join(ceRoot, "styles.css"), "utf8");
const dockerfile = await readFile(join(ceRoot, "..", "Dockerfile.ce"), "utf8").catch(() =>
  readFile(join(ceRoot, "..", "Dockerfile"), "utf8"),
);
const packageManifest = JSON.parse(
  await readFile(join(ceRoot, "..", "package.ce.json"), "utf8").catch(() =>
    readFile(join(ceRoot, "..", "package.json"), "utf8"),
  ),
);

for (const modulePath of [
  "./ui/AuthScreen",
  "./ui/ProductShell",
  "./views/OverviewView",
  "./views/RepositoriesView",
  "./views/EvidenceView",
  "./views/RemediationView",
  "./views/ReportsView",
  "./views/ArchitectureView",
]) {
  assert.match(app, new RegExp(`from "${modulePath.replaceAll("/", "\\/")}"`));
}

for (const forbidden of [
  /from\s+["'][^"']*src-next/i,
  /from\s+["'][^"']*flyto-cloud/i,
  /from\s+["'][^"']*(stripe|firebase)/i,
  /from\s+["'][^"']*(billing|entitlement|enterprise)/i,
]) {
  assert.doesNotMatch(joined, forbidden);
}

assert.ok(app.split("\n").length < 400, "App.tsx must remain a controller, not a monolith");
assert.match(styles, /--bg:\s*#0c1222/);
assert.match(styles, /--surface:\s*#151d2e/);
assert.match(styles, /--accent:\s*#8b5cf6/);
assert.match(styles, /\.cosmic-background/);
assert.match(joined, /src="\/favicon\.svg"/);
assert.match(dockerfile, /^COPY public \.\/public$/m);
assert.match(joined, new RegExp(`Community · v${packageManifest.version.replaceAll(".", "\\.")}`));
assert.match(joined, /original-auth-message/);
assert.match(styles, /\.original-auth-root/);
assert.match(styles, /background:\s*#1e1045/);

console.log(
  `CE product-shell contract passed (${files.length} public frontend files checked).`,
);
