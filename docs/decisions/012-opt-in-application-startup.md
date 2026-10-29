# ADR-012: Opt-in application startup

## Context

Earlier user installs created an XDG autostart entry and enabled the
`eyes-desktop.service` user unit. Both made Eyes resident at every login even
when the person had not asked to open it. Eyes also appears as an application
to people using the desktop, so launch intent should be explicit.

## Decision

Login startup is disabled by default.

The user installer:

- does not create `~/.config/autostart/eyes-desktop-autostart.desktop`;
- removes that file and the old install-prefix autostart file during upgrades;
- installs `eyes-desktop.service` but removes its wants link and calls
  `systemctl --user disable` without enabling it;
- does not start the host at the end of installation.

`eyes show` and the application entry still start the service on demand. The
service keeps `Restart=on-failure` so an active workload recovers from a crash,
while a clean user quit stays stopped.

The installer writes a standard freedesktop application entry named Eyes under
the selected install prefix's `share/applications` directory. Its command uses
the absolute `bin/eyes` path so graphical launchers do not depend on
`~/.local/bin` being present in their environment. The same folder already
contains the Eyes icon, and the installer refreshes the desktop database and
KDE service cache. A user can therefore launch Eyes from the application menu,
add a shortcut to the desktop, or pin it to a taskbar.

## Consequences

A fresh login no longer creates an Eyes process or wallpaper animation unless
the user explicitly launches Eyes. Codex hooks may start the host later in
response to real agent activity when no user suppression marker is present;
that is task-driven behavior rather than login autostart.

Users who intentionally want session startup can enable the installed user
unit themselves. The regression contract verifies that the official installer
does not do this on their behalf.
