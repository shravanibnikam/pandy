import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseSettings, type Settings } from "@pandy/shared-types";
import type { StorageAdapter } from "@pandy/core";

/**
 * Settings and engine state on disk as plain JSON. No database, no schema
 * migration engine — the whole persisted surface is a handful of numbers and
 * booleans, and parseSettings already degrades gracefully on anything it does
 * not recognise.
 */

export function dataDir(): string {
  return app.getPath("userData");
}

function settingsPath(): string {
  return join(dataDir(), "settings.json");
}

function statePath(): string {
  return join(dataDir(), "state.json");
}

/** Write to a temp file then rename, so a crash mid-write cannot truncate the real one. */
async function writeAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, path);
}

export async function loadSettings(): Promise<Settings> {
  try {
    return parseSettings(JSON.parse(await readFile(settingsPath(), "utf8")));
  } catch {
    // Missing on first run, corrupt after a bad shutdown — both mean defaults.
    return parseSettings({});
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeAtomic(settingsPath(), JSON.stringify(settings, null, 2));
}

/** Backs the engine. One JSON file, rewritten whole on each change. */
export function fileStorage(): StorageAdapter {
  let cache: Record<string, unknown> | null = null;

  const read = async (): Promise<Record<string, unknown>> => {
    if (cache) return cache;
    try {
      const parsed: unknown = JSON.parse(await readFile(statePath(), "utf8"));
      cache = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      cache = {};
    }
    return cache;
  };

  return {
    read: async <T>(key: string) => (await read())[key] as T | undefined,
    write: async <T>(key: string, value: T) => {
      const data = await read();
      data[key] = value;
      await writeAtomic(statePath(), JSON.stringify(data, null, 2));
    },
  };
}
