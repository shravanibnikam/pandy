# Publishing

## VS Code Marketplace

### One-time setup

1. Create a publisher at <https://marketplace.visualstudio.com/manage>. It must
   match the `publisher` field in `apps/vscode-extension/package.json`
   (currently `shravanibnikam`).
2. Create an Azure DevOps Personal Access Token with **Marketplace → Manage**
   scope, for **all accessible organizations**.
3. `pnpm exec vsce login shravanibnikam` and paste the token.

### Release

```bash
pnpm package:vscode                      # → release/pandy-vscode.vsix
code --install-extension release/pandy-vscode.vsix   # smoke-test locally first

cd apps/vscode-extension
pnpm exec vsce publish --no-dependencies             # or: publish minor / patch
```

`--no-dependencies` is required: esbuild has already inlined the workspace
packages, and without the flag vsce tries to resolve `workspace:*` protocol
versions and fails.

### Before publishing

- [ ] Bump `version` in `apps/vscode-extension/package.json`
- [ ] Add a `CHANGELOG.md` entry
- [ ] `pnpm test && pnpm typecheck && pnpm lint`
- [ ] Install the `.vsix` locally and confirm it activates
- [ ] Check `.vsix` contents are lean — `pnpm exec vsce ls --tree`, expect ~19
      files. If sources appear, `.vscodeignore` has regressed.

## Desktop app

```bash
pnpm package:electron        # current platform
```

Or per target, from `apps/electron-app`:

| Command | Output |
|---|---|
| `pnpm package:mac` | `release/electron/Pandy-<version>-arm64.dmg` and `-<version>.dmg` (x64) |
| `pnpm package:win` | `release/electron/Pandy Setup <version>.exe` |
| `pnpm package:linux` | `release/electron/Pandy-<version>.AppImage` |

All three cross-build from macOS — the Windows target uses electron-builder's
bundled wine, which is enough for an **unsigned** NSIS installer.

### Signing

Builds are unsigned by default (`identity: null` in `electron-builder.yml`).
Unsigned apps are usable but show a Gatekeeper or SmartScreen warning on first
launch.

**macOS** — needs an Apple Developer ID certificate:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=…
# Notarisation, for distribution outside the App Store:
export APPLE_ID=…  APPLE_APP_SPECIFIC_PASSWORD=…  APPLE_TEAM_ID=…
```

Then remove `identity: null` from `electron-builder.yml` and rebuild.

**Windows** — needs an Authenticode certificate:

```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=…
```

Signing a Windows binary properly requires `signtool` on Windows; the wine
fallback used for cross-building cannot sign. Use a Windows CI runner for
signed releases.

### Release checklist

- [ ] Bump `version` in `apps/electron-app/package.json`
- [ ] `pnpm test && pnpm typecheck && pnpm lint`
- [ ] `--pandy-selftest` reports one window, `focusable: false`,
      `alwaysOnTop: true` on the widget route
- [ ] Mount the `.dmg` and confirm `Pandy.app` launches to the tray with no
      dock icon (`LSUIElement` is `true`)
- [ ] Attach artifacts to a GitHub release

## Versioning

The two products version independently — a status-bar fix should not force a
desktop release. The root `package.json` version tracks the monorepo itself and
is not published anywhere.
