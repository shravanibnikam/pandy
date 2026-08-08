# Privacy

Pandy is offline software. It has no backend, no account system, no cloud sync
and no analytics. There is no telemetry — not "disabled by default", **absent**.
There is no code in this repository that makes a network request.

## What Pandy stores

Everything below is local, in plain JSON you can read, edit or delete.

| Data | Why |
|---|---|
| Your settings | Intervals, quiet hours, tone, widget preferences |
| Next reminder timestamps, per category | So a restart resumes rather than resets |
| Pause and focus expiry | So a pause survives a restart |
| Today's reminder count | For the daily limit, and the "N of M taken today" line |
| Recently shown message ids | So Pandy doesn't repeat itself |
| Widget position | So the mascot stays where you put it |
| An onboarding flag | So you're asked once |

That is the complete list. It is enforced by a test — `engine.test.ts` asserts
the exact set of persisted keys, so adding a field silently is not possible.

## What Pandy never touches

- Your files, your code, or anything in your workspace
- File paths, project names, or repository names
- Browsing history, clipboard, keystrokes or screen contents
- Anything identifying you or your machine

The VS Code extension stores in `globalState`, deliberately **not**
workspace state — Pandy has no business knowing which project you have open.

## Where it lives

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Pandy/` |
| Windows | `%APPDATA%\Pandy\` |
| Linux | `~/.config/Pandy/` |

- `settings.json` — your preferences (desktop app)
- `state.json` — schedule and counts
- `desktop-heartbeat.json` — a process id and a timestamp, nothing more

VS Code extension state lives in VS Code's own global storage, and its settings
in your `settings.json` under `pandy.*`.

### The heartbeat file

The only thing either product writes that the other reads. It contains a process
id and a timestamp, and exists so that installing both does not produce two
notifications for the same reminder. Delete it and the extension simply resumes
delivering reminders itself.

## Deleting everything

Remove the directory above. That is a complete uninstall of Pandy's data. For
the extension, also remove the `pandy.*` keys from your VS Code `settings.json`.

## Local statistics

The daily completion count is local, optional in the sense that nothing depends
on it, and reset by **Reset Schedule** or by deleting `state.json`. It is never
transmitted, and it is deliberately not framed as a streak — see the content
rules in `packages/messages/src/pool.test.ts`, which fail the build on guilt,
shame, medical claims or streak threats.
