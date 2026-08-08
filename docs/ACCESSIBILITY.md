# Accessibility

A reminder app that you cannot turn off, cannot navigate, or that flashes at you
is worse than no reminder app. These are treated as requirements, not polish.

## Motion

- **Reduced motion** is a setting in both products, and both also honour the OS
  `prefers-reduced-motion` preference without being asked.
- With it on, the mascot renders a **single still frame** and schedules no
  animation frames at all — it is not a slower animation, it is no animation.
- Animation can be disabled outright, separately from reduced motion.
- The mascot never flashes, strobes or moves rapidly. The fastest animation is
  10 fps.
- All CSS transitions are disabled under `prefers-reduced-motion`.

Covered by tests in `packages/mascot/src/animator.test.ts`: reduced motion
renders exactly one frame, schedules nothing, and never advances even when
animation frames are delivered.

## Keyboard

- Every control in both settings panels is reachable and operable by keyboard.
- Real `<label for>` on every input, so the label is a click and focus target.
- Related controls are grouped in `<fieldset>` with a `<legend>`.
- A visible focus ring is drawn everywhere via `:focus-visible`, in a colour
  drawn from the active theme.
- The desktop widget is non-focusable **by design** so it cannot trap focus or
  steal your caret; all its actions are also on the tray menu, which is
  keyboard-navigable through the OS.
- Opening the settings panel makes the window focusable so the keyboard works.

## Screen readers

- The status bar entry sets `accessibilityInformation`, so a screen reader
  announces "Pandy. Next: look away in 12 minutes" rather than an icon name.
- The mascot canvas has `role="img"` and an `aria-label`.
- The reminder bubble in the widget is `role="status"` with `aria-live="polite"`,
  so it is announced when it appears without interrupting.
- Day toggles use `aria-pressed`; opacity and volume sliders carry
  `aria-valuetext` so the value is spoken as a percentage rather than "0.95".
- Hints are wired to their control with `aria-describedby`.

## Colour and contrast

- **No state is communicated by colour alone.** Selected working days carry a
  check mark as well as a highlight; pause and focus states change the status
  bar text, not just its colour.
- The VS Code panel is styled entirely with VS Code theme variables, so it
  inherits the high-contrast themes automatically rather than approximating them.
- The desktop app follows the OS light/dark preference and can be pinned to
  either.
- Reminder text never relies on the emoji to carry meaning — every message reads
  correctly with emoji stripped, which is what the low-key tone is.

## Sound

- **Off by default.** Turning it on is a deliberate act.
- Volume is adjustable.
- Notifications are marked `silent` unless sound is explicitly enabled.

## Interruption and control

- Reminders are non-modal. They never take focus, never block input, and never
  sit in front of what you are doing.
- The desktop widget uses `setFocusable(false)` plus `showInactive()`, so a
  reminder arriving mid-sentence cannot steal your caret. Verified against real
  Electron state via `--pandy-selftest`.
- Pause is available from the status bar, the tray, the notification itself, the
  settings panel and a command — with explicit durations, not a vague "later".
- Every reminder category can be disabled individually.
- Quiet hours, active hours and working days all suppress reminders entirely.
- The OS notification settings are respected by construction: Pandy uses the
  platform notification API, so muting Pandy at the system level works and it
  does not fall back to some other mechanism.

## Language

Enforced as a test over every message in the pool
(`packages/messages/src/pool.test.ts`), so the build fails rather than the
tone drifting:

- No guilt or blame
- No shame
- No medical or health claims
- No streak threats or loss framing
- No harm framing
- No emoji at all in the low-key tone — choosing it opts out of the whole
  register, not just the slang

## Known gaps

- The pixel-art mascot is decorative and has no non-visual equivalent beyond its
  `aria-label`. Reminder text never depends on it.
- The desktop widget cannot be resized by keyboard; use the mascot size setting.
- Linux launch-at-login is not implemented — desktop environments vary too much
  for Electron's implementation to be reliable, so it is skipped rather than
  silently doing nothing.
