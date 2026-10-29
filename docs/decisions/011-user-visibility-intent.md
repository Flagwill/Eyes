# ADR-011: User visibility intent outranks agent activity

## Context

Eyes is launched by Codex lifecycle hooks and can also be launched by the
optional desktop user service. A normal hidden state only changes the current
host instance, so the next hook event can show the wallpaper again. The tray
quit action also exited the host while the service's unconditional restart
policy brought it back.

That behavior makes "hide" and "quit" unreliable user actions. Agent activity
must never override a visibility decision made by the person using Eyes.

## Decision

Persist one user-visibility marker at
`$XDG_STATE_HOME/eyes/user-visibility`, defaulting to
`~/.local/state/eyes/user-visibility`, with mode `0600`.

`eyes hide`, tray "隐藏 Eyes", and hiding through the tray toggle write the
marker before visibility changes. While it exists:

- the running host may accept activity and status updates but cannot render,
  publish attention, start completion fade timers, or emit debug actions;
- the command client does not automatically start a missing host;
- the Codex hook returns before contacting or launching Eyes;
- the optional systemd user unit is skipped when manually enabled at login if
  the host is not already running.

`eyes show`, tray "显示双眼", the tray toggle while hidden, and tray preview
are explicit user display requests. They remove the marker and then show Eyes.
`eyes idle` remains a transient agent-session end and does not suppress future
activity.

`eyes quit` and tray "退出" write the marker and exit the host. The user service
uses `Restart=on-failure`, so a clean quit remains stopped while an actual
crash can still recover. The command client waits for the host's blocking
wallpaper restore and clean exit, then stops the service only as a timeout
fallback. Stopping systemd before that restore would leave the origin snapshot
behind and could expose Eyes' temporary wallpaper configuration.
Only an explicit display request restarts it.

## Consequences

Opening a new Codex task no longer exposes Eyes after the user hid them. The
official installer does not enable login autostart; an intentionally enabled
user unit also remains dormant across that visibility decision. The marker is
small, local metadata and contains only `hidden` or `quit`; it contains no
session, prompt, tool, or user content.

The browser development page is independent of the desktop marker. This ADR
governs the Plasma desktop host and Codex lifecycle integration.
