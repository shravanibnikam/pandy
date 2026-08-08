import { contextBridge, ipcRenderer } from "electron";
import type { MascotState, ReminderResult, ReminderType } from "@pandy/shared-types";
import { CHANNELS, type AppState, type PandyBridge, type ReminderPayload, type Route } from "../shared/ipc.js";

/**
 * The entire bridge between the sandboxed renderer and the main process.
 *
 * Deliberately thin: every method is a fixed channel with a fixed shape. The
 * renderer never sees ipcRenderer itself, so it cannot invoke an arbitrary
 * channel, and it never receives the raw IpcRendererEvent, so it cannot reach
 * the sender. Payloads are validated again in main — this side is convenience,
 * not security.
 */

function subscribe<T>(channel: string, handler: (value: T) => void): () => void {
  const listener = (_event: unknown, value: T) => handler(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: PandyBridge = {
  getState: () => ipcRenderer.invoke(CHANNELS.getState) as Promise<AppState>,

  resolveReminder: (type: ReminderType, result: ReminderResult) =>
    ipcRenderer.invoke(CHANNELS.resolveReminder, { type, result }) as Promise<void>,

  setSettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke(CHANNELS.setSettings, patch) as Promise<void>,

  triggerNow: () => ipcRenderer.invoke(CHANNELS.triggerNow) as Promise<void>,
  pause: (minutes: number) => ipcRenderer.invoke(CHANNELS.pause, { minutes }) as Promise<void>,
  resume: () => ipcRenderer.invoke(CHANNELS.resume) as Promise<void>,
  resetSchedule: () => ipcRenderer.invoke(CHANNELS.resetSchedule) as Promise<void>,
  completeOnboarding: () => ipcRenderer.invoke(CHANNELS.completeOnboarding) as Promise<void>,

  moveWidget: (x: number, y: number) =>
    ipcRenderer.invoke(CHANNELS.moveWidget, { x, y }) as Promise<void>,
  setWidgetVisible: (visible: boolean) =>
    ipcRenderer.invoke(CHANNELS.setWidgetVisible, { visible }) as Promise<void>,

  openSettings: () => ipcRenderer.invoke(CHANNELS.openSettings) as Promise<void>,
  closeSettings: () => ipcRenderer.invoke(CHANNELS.closeSettings) as Promise<void>,
  contextMenu: () => ipcRenderer.invoke(CHANNELS.contextMenu) as Promise<void>,
  quit: () => ipcRenderer.invoke(CHANNELS.quit) as Promise<void>,

  onState: (handler: (state: AppState) => void) => subscribe(CHANNELS.onState, handler),
  onMascot: (handler: (state: MascotState) => void) => subscribe(CHANNELS.onMascot, handler),
  onReminder: (handler: (reminder: ReminderPayload) => void) =>
    subscribe(CHANNELS.onReminder, handler),
  onRoute: (handler: (route: Route) => void) => subscribe(CHANNELS.onRoute, handler),
};

contextBridge.exposeInMainWorld("pandy", bridge);
