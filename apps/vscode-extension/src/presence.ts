import { homedir, platform } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parseHeartbeat, type Heartbeat } from "@pandy/core";

/**
 * Where the desktop app writes its heartbeat. This derivation is duplicated in
 * apps/electron-app/src/main/presence.ts and the two must agree — there is a
 * test in tests/ that pins the expected path on each platform so they cannot
 * drift apart silently.
 */
export function pandyDataDir(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Pandy");
    case "win32":
      return join(process.env["APPDATA"] ?? join(home, "AppData", "Roaming"), "Pandy");
    default:
      return join(process.env["XDG_CONFIG_HOME"] ?? join(home, ".config"), "Pandy");
  }
}

export function heartbeatPath(): string {
  return join(pandyDataDir(), "desktop-heartbeat.json");
}

/**
 * Reads the desktop app's heartbeat. A missing file is the normal case — most
 * users will only have the extension — so it is not an error.
 */
export async function readDesktopHeartbeat(): Promise<Heartbeat | null> {
  try {
    return parseHeartbeat(await readFile(heartbeatPath(), "utf8"));
  } catch {
    return null;
  }
}
