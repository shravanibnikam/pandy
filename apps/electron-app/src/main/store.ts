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

let writeSeq = 0;
/** One in-flight write per path, so concurrent saves queue instead of racing. */
const writeQueues = new Map<string, Promise<void>>();

/**
 * Write to a temp file then rename, so a crash mid-write cannot truncate the
 * real one.
 *
 * Two things here are load-bearing and were both learned the hard way:
 *
 *   The temp name includes a counter, not just the pid. The pid is identical
 *   for every write in the process, so two overlapping writes previously used
 *   the *same* temp path — the first rename moved it away and the second threw
 *   ENOENT, losing that save.
 *
 *   Writes to the same path are serialised. The settings panel saves on every
 *   keystroke-sized change, so overlapping writes are the normal case, not an
 *   edge case, and interleaved read-modify-write would drop fields.
 */
async function writeAtomic(path: string, contents: string): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.${++writeSeq}.tmp`;
      await writeFile(tmp, contents, "utf8");
      await rename(tmp, path);
    });

  writeQueues.set(path, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(path) === next) writeQueues.delete(path);
  }
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
