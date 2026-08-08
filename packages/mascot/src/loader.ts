import { ANIMATIONS, FRAME_SIZE, REQUIRED_STRIPS } from "./animations.js";
import type { SpriteSheet } from "./ports.js";

/**
 * Preloads every strip the runtime actually needs, in parallel, before the
 * first paint. Decoding to ImageBitmap where available keeps the first frame
 * from stalling on decode.
 */
export async function loadSheets(
  baseUrl: string,
): Promise<Record<string, SpriteSheet>> {
  const entries = await Promise.all(
    REQUIRED_STRIPS.map(async (strip): Promise<[string, SpriteSheet]> => {
      const url = `${baseUrl.replace(/\/$/, "")}/${strip}`;
      const image = await loadImage(url);
      return [strip, { image, frames: Math.round(image.width / FRAME_SIZE) }];
    }),
  );
  return Object.fromEntries(entries);
}

async function loadImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function" && typeof fetch === "function") {
    try {
      const response = await fetch(url);
      if (response.ok) return await createImageBitmap(await response.blob());
    } catch {
      // Fall through to the <img> path — a webview CSP may block fetch on a
      // vscode-resource URL even though an img tag loads it fine.
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load sprite strip: ${url}`));
    img.src = url;
  });
}

/**
 * Sanity-check loaded strips against the declared frame counts. A silently
 * truncated or swapped asset otherwise shows up as a blank final frame rather
 * than as an error.
 */
export function verifySheets(sheets: Readonly<Record<string, SpriteSheet>>): string[] {
  const problems: string[] = [];
  for (const [state, config] of Object.entries(ANIMATIONS)) {
    const sheet = sheets[config.strip];
    if (!sheet) {
      problems.push(`${state}: missing strip ${config.strip}`);
      continue;
    }
    if (sheet.frames < config.frames) {
      problems.push(
        `${state}: ${config.strip} has ${sheet.frames} frames, config declares ${config.frames}`,
      );
    }
    if (sheet.image.height !== FRAME_SIZE) {
      problems.push(`${state}: ${config.strip} is ${sheet.image.height}px tall, expected ${FRAME_SIZE}`);
    }
  }
  return problems;
}

/** Detects the OS reduced-motion preference where the host exposes it. */
export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
