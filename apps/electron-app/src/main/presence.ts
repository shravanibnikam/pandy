import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HEARTBEAT_INTERVAL_MS } from "@pandy/core";
import { dataDir } from "./store.js";

/**
 * Publishes "the desktop app is running" for the VS Code extension to read.
 *
 * The extension derives this same path independently in
 * apps/vscode-extension/src/presence.ts; tests/presence-path.test.ts pins both
 * so they cannot drift apart silently.
 *
 * app.getPath("userData") resolves to the platform's per-user application data
 * directory plus the productName, which is exactly what the extension computes.
 */
export function heartbeatPath(): string {
  return join(dataDir(), "desktop-heartbeat.json");
}

let timer: ReturnType<typeof setTimeout> | null = null;

async function writeHeartbeat(): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(
      heartbeatPath(),
      JSON.stringify({ pid: process.pid, updatedAt: Date.now() }),
      "utf8",
    );
  } catch {
    // A heartbeat that cannot be written just means the extension keeps
    // delivering reminders. Degraded, not broken — never worth crashing over.
  }
}

/**
 * Refreshes on a chained timeout rather than setInterval, so a stalled write
 * cannot queue up overlapping runs.
 */
export function startHeartbeat(): void {
  if (timer !== null) return;
  const tick = () => {
    void writeHeartbeat().finally(() => {
      timer = setTimeout(tick, HEARTBEAT_INTERVAL_MS);
      timer.unref?.();
    });
  };
  tick();
}

export async function stopHeartbeat(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  // Remove it on a clean exit so the extension takes over immediately rather
  // than waiting out the staleness window.
  try {
    await rm(heartbeatPath(), { force: true });
  } catch {
    /* best effort */
  }
}
