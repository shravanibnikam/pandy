import { describe, expect, it } from "vitest";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { pandyDataDir } from "../apps/vscode-extension/src/presence.js";

/**
 * Duplicate-reminder prevention only works if both products look at the same
 * file. The extension derives the path itself (it has no Electron API) and the
 * desktop app uses app.getPath("userData"). Those two must agree.
 *
 * This pins the extension's derivation against the documented behaviour of
 * app.getPath("userData"), which is the platform's per-user application data
 * directory plus the productName — "Pandy", set in the Electron package.json.
 */
const PRODUCT_NAME = "Pandy";

describe("shared data directory", () => {
  it("matches what Electron's userData resolves to on this platform", () => {
    const home = homedir();
    const expected =
      platform() === "darwin"
        ? join(home, "Library", "Application Support", PRODUCT_NAME)
        : platform() === "win32"
          ? join(process.env["APPDATA"] ?? join(home, "AppData", "Roaming"), PRODUCT_NAME)
          : join(process.env["XDG_CONFIG_HOME"] ?? join(home, ".config"), PRODUCT_NAME);

    expect(pandyDataDir()).toBe(expected);
  });

  it("ends with the product name, so the two apps land in the same folder", () => {
    expect(pandyDataDir().endsWith(PRODUCT_NAME)).toBe(true);
  });

  it("is an absolute path", () => {
    expect(pandyDataDir().startsWith("/") || /^[A-Za-z]:\\/.test(pandyDataDir())).toBe(true);
  });
});
