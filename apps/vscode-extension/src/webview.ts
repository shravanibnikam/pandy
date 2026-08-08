import * as vscode from "vscode";
import { isRecord, type Settings } from "@pandy/shared-types";
import type { ReminderEngine } from "@pandy/core";
import { WRITABLE_KEYS, readSettings, writeSetting } from "./config.js";

/**
 * The settings / onboarding / preview panel.
 *
 * Created lazily — most sessions never open it, and a webview that is never
 * shown should cost nothing. Security posture:
 *
 *   - a fresh nonce per load, and a CSP that permits only nonce-tagged scripts
 *   - localResourceRoots pinned to media/, so nothing outside it can be loaded
 *   - no remote content of any kind: default-src 'none', no connect-src
 *   - every inbound message validated against a closed set of types, with
 *     unknown types dropped rather than ignored silently
 */
export class SettingsPanel {
  static #current: SettingsPanel | undefined;

  readonly #panel: vscode.WebviewPanel;
  readonly #engine: ReminderEngine;
  readonly #disposables: vscode.Disposable[] = [];

  static show(context: vscode.ExtensionContext, engine: ReminderEngine): void {
    if (SettingsPanel.#current) {
      SettingsPanel.#current.#panel.reveal();
      return;
    }
    SettingsPanel.#current = new SettingsPanel(context, engine);
  }

  static disposeCurrent(): void {
    SettingsPanel.#current?.dispose();
  }

  /** Push fresh state into an open panel; a no-op when nothing is open. */
  static refresh(): void {
    const panel = SettingsPanel.#current;
    if (panel) panel.#post();
  }

  private constructor(context: vscode.ExtensionContext, engine: ReminderEngine) {
    this.#engine = engine;

    const mediaRoot = vscode.Uri.joinPath(context.extensionUri, "media");
    this.#panel = vscode.window.createWebviewPanel("pandy.settings", "Pandy", vscode.ViewColumn.One, {
      enableScripts: true,
      // Nothing outside media/ is reachable from the webview.
      localResourceRoots: [mediaRoot],
      retainContextWhenHidden: false,
      enableCommandUris: false,
      enableForms: false,
    });

    this.#panel.iconPath = vscode.Uri.joinPath(mediaRoot, "icon.png");
    this.#panel.webview.html = this.#html(mediaRoot);

    this.#panel.webview.onDidReceiveMessage(
      (raw: unknown) => void this.#onMessage(raw),
      null,
      this.#disposables,
    );
    this.#panel.onDidDispose(() => this.dispose(), null, this.#disposables);

    this.#post();
  }

  dispose(): void {
    SettingsPanel.#current = undefined;
    this.#panel.dispose();
    for (const d of this.#disposables.splice(0)) d.dispose();
  }

  #post(): void {
    const settings: Settings = readSettings();
    const next = this.#engine.peekNext();
    void this.#panel.webview.postMessage({
      type: "state",
      settings,
      onboarded: this.#engine.getState().onboarded,
      daily: this.#engine.getState().daily,
      paused: this.#engine.isPaused(),
      next: next ? { type: next.type, dueAt: next.dueAt } : null,
    });
  }

  /**
   * Validates every inbound message. The webview is a separate, scriptable
   * context; treating anything it sends as trusted would make a settings panel
   * into an arbitrary-configuration-write primitive.
   */
  async #onMessage(raw: unknown): Promise<void> {
    if (!isRecord(raw) || typeof raw["type"] !== "string") return;

    switch (raw["type"]) {
      case "ready":
        this.#post();
        return;

      case "setSetting": {
        const key = raw["key"];
        const value = raw["value"];
        // Closed allow-list: a key not in it is not writable, full stop.
        if (typeof key !== "string" || !WRITABLE_KEYS.includes(key)) return;
        if (!isWritableValue(value)) return;
        await writeSetting(key, value);
        return;
      }

      case "command": {
        const name = raw["name"];
        const ALLOWED = [
          "pandy.takeBreakNow",
          "pandy.pause",
          "pandy.resume",
          "pandy.resetSchedule",
        ] as const;
        if (typeof name !== "string" || !(ALLOWED as readonly string[]).includes(name)) return;
        await vscode.commands.executeCommand(name);
        this.#post();
        return;
      }

      case "completeOnboarding":
        await this.#engine.setOnboarded(true);
        this.#post();
        return;

      default:
        // Unknown message type. Dropped deliberately, and logged so a genuine
        // bug in the webview is visible rather than silently swallowed.
        console.warn(`[pandy] ignored unknown webview message: ${String(raw["type"])}`);
        return;
    }
  }

  #html(mediaRoot: vscode.Uri): string {
    const webview = this.#panel.webview;
    const nonce = makeNonce();
    const uri = (...parts: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, ...parts)).toString();

    // default-src 'none' means anything not explicitly allowed below is denied,
    // including every form of remote fetch.
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${uri("webview.css")}" rel="stylesheet">
<title>Pandy</title>
</head>
<body data-strips="${uri("strips")}">
  <div id="app" role="main" aria-busy="true">
    <p class="loading">Loading Pandy…</p>
  </div>
  <script nonce="${nonce}" src="${uri("webview.js")}"></script>
</body>
</html>`;
  }
}

/** Values the settings panel may write: primitives and string arrays only. */
function isWritableValue(value: unknown): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === "string" || typeof v === "number");
  }
  return false;
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
