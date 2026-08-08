import type * as vscode from "vscode";
import type { StorageAdapter } from "@pandy/core";

/**
 * Backs the engine with VS Code's globalState, so a schedule survives a window
 * reload and follows the user across workspaces. Nothing workspace-scoped is
 * stored — Pandy has no business knowing which project you have open.
 */
export function globalStateStorage(context: vscode.ExtensionContext): StorageAdapter {
  return {
    read: async <T>(key: string) => context.globalState.get<T>(key),
    write: async <T>(key: string, value: T) => {
      await context.globalState.update(key, value);
    },
  };
}
