# ADR-002: Use Eyes as the only identity and keep eye contours crisp

## Status
Accepted, 2026-10-22. Updates the visual treatment in ADR-001; its wallpaper architecture remains in force.

## Context
The project owner chose **Eyes** as the only project name. Separate names across the browser, command line, host, wallpaper plugin and cursor bridge made the product inconsistent. Leaving the previous host and autostart enabled would also create duplicate processes competing for the state bridge.

The owner also requested fully clear eye contours. Broad edge coverage and glow made the entire eye appear blurred against the frosted wallpaper.

## Decision
Use Eyes in all product text, `eyes` for commands, `eyes-desktop` for the host, `window.eyes` for the browser API, and `EyesCore` for the shared engine. Use `org.eyes.wallpaper` for the Plasma wallpaper, `org.eyes.Desktop` for the D-Bus service/interface, `eyes-cursor` for the KWin script, and `eyes.sock` for the local socket. Environment overrides use the `EYES_` prefix.

Do not provide aliases under the previous name. Isolate old identifiers in the installer migration helper and regression fixtures. Stop and unload previous components before enabling the new bridge, preserve the current wallpaper image, then remove obsolete binaries, plugins and autostart entries. Keep user images and other user data.

Render solid, square-cornered rectangular bands with only pixel-sized antialiasing. Remove silhouette feathering, Canvas eye blur, shadows and outer glow. Keep the soft internal highlights and independently cached wallpaper blur.

## Validation
Model and packaging tests cover animation behavior, removal of previous entries, image preservation and avoiding panel changes. GPU pixel checks cover all eight expressions, opaque purple immediately inside each contour and clear pixels immediately outside it. The isolated cursor test exercises the new executable, socket and D-Bus identities.

## Consequences
External harness commands and browser integrations must use the new interfaces after upgrading. There is one installed application identity and one autostart entry. Future visual tuning must retain crisp contours rather than introducing blur through an outer effect.
