# Setup

## Requirements

- **Node ≥ 20** (developed on 26.7.0)
- **pnpm** — `npm install -g pnpm`
- Python 3 with Pillow, only if you want to regenerate sprite assets

## Install

```bash
git clone https://github.com/shravanibnikam/pandy.git
cd pandy
pnpm install
```

## Everyday commands

```bash
pnpm build        # build every package and app
pnpm test         # full test suite — fake timers, nothing waits in real time
pnpm typecheck    # project-wide tsc -b
pnpm lint         # eslint
pnpm clean        # remove all build output
```

## Developing the VS Code extension

```bash
pnpm dev:vscode          # esbuild in watch mode
```

Then open `apps/vscode-extension` in VS Code and press <kbd>F5</kbd> to launch an
Extension Development Host with Pandy loaded.

The extension bundles to a single `dist/extension.js` with `vscode` marked
external. The webview is a second, separate bundle (`media/webview.js`) because
it runs in a browser context, not the extension host.

## Developing the desktop app

```bash
pnpm dev:electron        # build once, then launch Electron
```

Useful flags:

```bash
# Report the real window state and exit — verifies transparency, focusability,
# always-on-top, size and route without needing to look at the screen.
PANDY_SELFTEST_OUT=/tmp/pandy.json \
  node_modules/.pnpm/electron@*/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  apps/electron-app --pandy-selftest
```

App data lives in the platform's user-data directory:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Pandy/` |
| Windows | `%APPDATA%\Pandy\` |
| Linux | `~/.config/Pandy/` |

Deleting that folder resets Pandy to a first run.

## Packaging

```bash
pnpm package:vscode      # → release/pandy-vscode.vsix
pnpm package:electron    # → release/electron/ for the current platform
```

Per-platform Electron targets:

```bash
cd apps/electron-app
pnpm package:mac         # .dmg (arm64 + x64)
pnpm package:win         # NSIS installer (uses electron-builder's bundled wine on macOS)
pnpm package:linux       # AppImage
```

All three cross-build from macOS. Builds are **unsigned** — see
[PUBLISHING.md](./PUBLISHING.md) for signing.

## Regenerating sprite assets

`wave_strip.png` and `drink_strip.png` are generated: the supplied art drew
those two animations without the bamboo sprout every other animation wears.

```bash
python3 scripts/graft-sprout.py           # regenerate from the pristine originals
python3 scripts/graft-sprout.py --check   # verify, non-zero exit on drift
```

The pristine originals live in `design/mascot/original-strips/` and are the
script's source of truth, so it is idempotent.

## Troubleshooting

### `Electron failed to install correctly`

Electron's postinstall occasionally extracts its binary only partially, leaving
a `dist/` folder of a few hundred KB and no `path.txt`. It exits 0, so pnpm
reports success. The download itself is usually fine and cached.

```bash
E=$(node -e "console.log(require.resolve('electron').replace(/index\.js$/,''))")
CACHE=$(ls -d ~/Library/Caches/electron/*/ | head -1)
rm -rf "$E/dist" && mkdir -p "$E/dist"
unzip -q "$CACHE"/electron-*.zip -d "$E/dist"
printf 'Electron.app/Contents/MacOS/Electron' > "$E/path.txt"   # macOS
```

A healthy `dist/` is ~240 MB and contains `Electron.app/Contents/Frameworks/`.

### Reminders never arrive

Check, in order:

1. **Working days** — the default is Monday to Friday. On a weekend every
   reminder is correctly deferred to the next working day.
2. **Active hours** — default 08:00–20:00.
3. **Quiet hours** — default 20:00–08:00.
4. Whether Pandy is paused or in focus mode.
5. `pandy.deliveryOwner` — if it is `desktop` and the desktop app is running,
   VS Code stays quiet on purpose.

The status bar tooltip and the tray menu both show the next reminder time,
which is the quickest way to tell deferral from a genuine problem.

### Both apps notify me twice

They should not — that is what the delivery-owner heartbeat prevents. If you
see it, check that both are reading the same data directory (the table above);
the extension derives that path itself and `tests/presence-path.test.ts` pins it.
