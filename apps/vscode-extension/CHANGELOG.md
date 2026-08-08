# Changelog

All notable changes to Pandy are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

First release.

### Added

- Four reminder categories — water, stand and stretch, look away, and outside
  break — each with its own interval and on/off switch.
- Quiet hours, including windows that cross midnight, plus working days and an
  active-hours window.
- Snooze, pause for a chosen duration, and focus mode.
- A daily reminder limit and a minimum cooldown between any two reminders.
- Optional ±N minute randomisation so reminders never feel mechanical.
- Status bar mascot with a countdown to the next reminder.
- Settings, onboarding and animation preview in a webview panel.
- Three tones — low-key, Gen Z and chaotic — plus custom messages per category.
- Reduced-motion support and a keyboard-accessible settings panel.
- Delivery ownership, so installing the Pandy desktop app alongside this
  extension never produces two notifications for the same reminder.
- Commands: Take Break Now, Pause, Resume, Open Settings, Reset Schedule.

### Notes

- Schedules survive a restart. If reminders came due while VS Code was closed,
  at most one fires — there is never a backlog.
- No account, no network access, no telemetry.
