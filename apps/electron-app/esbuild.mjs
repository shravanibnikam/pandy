import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/*
 * Main and preload are emitted as .cjs. Electron loads the main entry as
 * CommonJS unless the whole package is ESM, and a sandboxed preload must be
 * CommonJS regardless — an ESM preload silently fails to run.
 */
const mainConfig = {
  entryPoints: [resolve(here, "src/main/index.ts")],
  bundle: true,
  outfile: resolve(here, "dist/main/index.cjs"),
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["electron"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

const preloadConfig = {
  entryPoints: [resolve(here, "src/preload/index.ts")],
  bundle: true,
  outfile: resolve(here, "dist/preload/index.cjs"),
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["electron"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

const rendererConfig = {
  entryPoints: [resolve(here, "src/renderer/main.ts")],
  bundle: true,
  outfile: resolve(here, "dist/renderer/renderer.js"),
  format: "iife",
  platform: "browser",
  target: "chrome120",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

async function copyStatic() {
  const rendererOut = resolve(here, "dist/renderer");
  await mkdir(rendererOut, { recursive: true });

  for (const file of ["index.html", "renderer.css"]) {
    await cp(resolve(here, "src/renderer", file), resolve(rendererOut, file));
  }

  // Sprite strips ship from the single source in assets/.
  const strips = resolve(rendererOut, "strips");
  await rm(strips, { recursive: true, force: true });
  await cp(resolve(repoRoot, "assets/mascot/strips"), strips, { recursive: true });

  // Sound cues, from the single source in assets/.
  const sounds = resolve(rendererOut, "sounds");
  await rm(sounds, { recursive: true, force: true });
  await cp(resolve(repoRoot, "assets/sounds"), sounds, { recursive: true });

  // Tray and app icons.
  await cp(resolve(here, "build/tray.png"), resolve(rendererOut, "tray.png"));
}

await copyStatic();

if (watch) {
  const contexts = await Promise.all([
    context(mainConfig),
    context(preloadConfig),
    context(rendererConfig),
  ]);
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("[pandy] watching…");
} else {
  await Promise.all([build(mainConfig), build(preloadConfig), build(rendererConfig)]);
  console.log(`[pandy] built${production ? " (production)" : ""}`);
}
