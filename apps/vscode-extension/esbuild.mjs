import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** Copy the shipped sprite strips into media/ so the webview can load them
 *  from localResourceRoots. assets/mascot/strips is the single source. */
async function copyAssets() {
  const dest = resolve(here, "media/strips");
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(resolve(repoRoot, "assets/mascot/strips"), dest, { recursive: true });
}

/** The extension host bundle: one file, vscode left external. */
const extensionConfig = {
  entryPoints: [resolve(here, "src/extension.ts")],
  bundle: true,
  outfile: resolve(here, "dist/extension.js"),
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

/** The webview bundle: browser context, no Node built-ins. */
const webviewConfig = {
  entryPoints: [resolve(here, "src/webview-ui/main.ts")],
  bundle: true,
  outfile: resolve(here, "media/webview.js"),
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

await copyAssets();

if (watch) {
  const contexts = await Promise.all([context(extensionConfig), context(webviewConfig)]);
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("[pandy] watching…");
} else {
  await Promise.all([build(extensionConfig), build(webviewConfig)]);
  console.log(`[pandy] built${production ? " (production)" : ""}`);
}
