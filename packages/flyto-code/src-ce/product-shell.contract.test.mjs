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
const authScreen = await readFile(join(ceRoot, "ui", "AuthScreen.tsx"), "utf8");
const styles = await readFile(join(ceRoot, "styles.css"), "utf8");
const visualContract = JSON.parse(
  await readFile(join(ceRoot, "visual-contract.json"), "utf8"),
);
const dockerfile = await readFile(join(ceRoot, "..", "Dockerfile.ce"), "utf8").catch(() =>
  readFile(join(ceRoot, "..", "Dockerfile"), "utf8"),
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
assert.match(styles, /grid-template-columns:\s*280px minmax\(0, 1fr\)/);
assert.match(styles, /min-height:\s*64px/);
assert.match(styles, /font-family:\s*Roboto, Helvetica, Arial, sans-serif/);
assert.match(styles, /\.auth-form[\s\S]*?width:\s*320px/);
assert.match(styles, /\.auth-field input[\s\S]*?height:\s*48px/);
assert.match(styles, /\.auth-submit[\s\S]*?min-height:\s*36px/);
assert.match(styles, /\.auth-title h1[\s\S]*?font-size:\s*24px/);
assert.match(styles, /\.auth-welcome[\s\S]*?font-size:\s*48px/);
assert.match(styles, /\.auth-message[\s\S]*?padding:\s*64px 112px/);
assert.match(joined, /src="\/favicon\.svg"/);
assert.match(dockerfile, /^COPY public \.\/public$/m);
assert.match(joined, /auth-message/);
assert.match(
  authScreen,
  /<strong>\{languages\.length\}<\/strong><span>\{t\("auth\.pillarLocales"\)\}<\/span>/,
);
assert.doesNotMatch(
  authScreen,
  /<strong>\d+<\/strong><span>\{t\("auth\.pillarLocales"\)\}<\/span>/,
);
assert.match(styles, /\.auth-layout/);
assert.match(styles, /--sidebar:\s*#1e1045/);
assert.doesNotMatch(joined, /CosmicBackground/);
assert.doesNotMatch(joined, /boundary-card|instance-state|original-auth/);

assert.equal(visualContract.schema, "flyto.warroom-ce-visual-contract.v1");
assert.equal(visualContract.canonical_baseline, "src-next");
assert.equal(visualContract.tokens.navbar_width, "280px");
assert.equal(visualContract.tokens.toolbar_height, "64px");
assert.equal(visualContract.tokens.auth_form_width, "320px");
assert.equal(visualContract.tokens.auth_input_height, "48px");
assert.equal(visualContract.tokens.auth_button_height, "36px");
assert.equal(visualContract.tokens.auth_title_size, "24px");
assert.equal(visualContract.tokens.auth_message_title_size, "48px");
assert.equal(visualContract.tokens.auth_message_horizontal_padding, "112px");
assert.equal(visualContract.tokens.dark_background, "#0c1222");
assert.equal(visualContract.tokens.dark_paper, "#151d2e");
assert.equal(visualContract.tokens.navbar_background, "#1e1045");
assert.equal(
  visualContract.tokens.font_family,
  "Roboto, Helvetica, Arial, sans-serif",
);

const canonicalTheme = await readFile(
  join(ceRoot, "..", "src-next", "configs", "themesConfig.ts"),
  "utf8",
).catch(() => "");
const canonicalNavbar = await readFile(
  join(
    ceRoot,
    "..",
    "src-next",
    "components",
    "theme-layouts",
    "layout1",
    "components",
    "navbar",
    "style-1",
    "NavbarStyle1.tsx",
  ),
  "utf8",
).catch(() => "");

if (canonicalTheme) {
  for (const token of [
    "#7c3aed",
    "#8b5cf6",
    "#a78bfa",
    "#6d28d9",
    "#06b6d4",
    "#1e1045",
    "#2a1557",
    "#f5f5f5",
    "#0c1222",
    "#151d2e",
  ]) {
    assert.match(
      canonicalTheme.toLowerCase(),
      new RegExp(token.replace("#", "\\#")),
      `canonical src-next theme must still expose ${token}`,
    );
  }
}
if (canonicalNavbar) {
  assert.match(canonicalNavbar, /const navbarWidth = 280/);
}

console.log(
  `CE product-shell contract passed (${files.length} public frontend files checked).`,
);
