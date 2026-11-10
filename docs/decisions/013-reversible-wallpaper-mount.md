# ADR-013: Reversible wallpaper mounting

## Status
Accepted, 2026-10-29.

## Context
Eyes is implemented as a Plasma wallpaper plugin, so displaying it requires
changing each desktop containment's active wallpaper plugin. Earlier releases
did this during installation and used a persistent watcher to force Eyes back
whenever Plasma settings replaced it. Starting Eyes therefore replaced the
person's wallpaper and could also overwrite a new choice made while Eyes was
running.

A visual overlay must not permanently own desktop configuration. At the same
time, writing only `kwriteconfig6 --notify` is insufficient: an already-running
Plasma containment can retain its current plugin even when the file says
otherwise.

## Decision
Installation never selects Eyes. The host restores once at startup, which also
repairs temporary mounts left by a crash and permanent mounts left by older
releases.

The host performs two explicit operations:

- When visibility changes to shown, snapshot every desktop containment's
  original plugin and all of its non-Eyes wallpaper groups, persist that origin,
  then switch the saved and live containment to `org.eyes.wallpaper`.
- When visibility changes to hidden, wait 850 ms for the shared fade, then
  restore all saved keys, the original plugin, and the running containment.
  User quit and application shutdown first attempt a blocking restore.

The origin file defaults to
`$XDG_STATE_HOME/eyes/wallpaper-origin.json` and uses mode `0600`. The parent
directory uses mode `0700`. Writes are atomic and include only desktop
containments with `formfactor=0` and `plugin=org.kde.plasma.folder`; panels are
never entered into the state. Repeated show requests retain the first saved
origin instead of replacing it with Eyes values.

Persist the origin before changing configuration. Clear it only after both the
saved configuration and the live PlasmaShell containment accept the restore.
Apply live changes with `PlasmaShell.evaluateScript`, targeting the current
desktop `id` rather than assuming containment order. Package wallpapers are
stored as their original package URLs; the Eyes wallpaper scene resolves them
through Plasma's `DayNightWallpaper`, so `images` versus `images_dark` follows
the active color scheme instead of being frozen to a light image. Slideshow
paths and solid colors remain valid configuration values.

If the active plugin changes to something other than Eyes while an origin is
saved, treat that as a new choice by the person using the desktop and discard
the stale origin. Never overwrite it. If the active plugin is still Eyes but no
origin exists, legacy recovery may infer the prior plugin only when the saved
image, color, fill mode, and known plugin sections provide a clear match;
ambiguous data is left untouched.

The installer runs restore with legacy recovery and runtime activation, but
does not run mount. Failures keep the origin and retry instead of losing the
ability to return to the original wallpaper. The implementation remains a
Plasma wallpaper plugin: it creates no extra window, receives no input, and
does not alter compositor blur or panel configuration.

### Amendment, 2026-11-03: primary screen and live settings

Eyes is shown on the primary screen only. Mount selects the desktop
containments on Plasma screen 0, which Plasma always assigns to the
highest-priority output; one per activity, so all of them are mounted. A
config without `lastScreen` is treated as single-screen. Other monitors keep
their wallpaper. Restore still covers every desktop that has a saved origin,
including secondary desktops mounted by earlier releases.

plasmashell keeps its own copy of the desktop configuration, so values written
with `kwriteconfig6` are not seen by a wallpaper it creates afterwards. A first
show after Plasma started therefore created the Eyes wallpaper with an empty
`Image` and painted only its fallback color. The runtime script now switches
each target to Eyes and then writes `Image`, `Color` and `FillMode` with the
scripting `writeConfig`. Order matters: `writeConfig` also pushes each value
into whichever wallpaper is live at that moment, regardless of the selected
group, so writing before the switch, or when the switch did not take, would
leak Eyes values into the original wallpaper. The Eyes `main.xml` declares
`Color` and `FillMode` so the copied values are read.

## Consequences
The original wallpaper returns on hide, completion fade, clean quit, and the
next startup after a crash. There can be a short plugin-switch delay after the
reveal fade, but Eyes does not permanently own the desktop configuration.

The state file is local metadata, not wallpaper content. Legacy recovery is
best effort; if an older installation no longer contains enough matching data,
Eyes refuses to guess. A stale temporary mount is repaired by the next host
start or installer run.

## Verification
Packaging tests cover exact origin capture, repeat-safe mount, full restore,
panel isolation, user-choice precedence, package color-scheme preservation,
and legacy recovery. The real-host lifecycle test uses a temporary config,
state directory, D-Bus session, and wallpaper command mock to verify the
operation order: startup restore, show mount, hide restore, show mount, quit
restore. A packaging test executes the generated Plasma script against
recording desktops to check primary-only targets, switch-before-write order and
no writes when the switch does not take.

Mocks cannot reproduce plasmashell's config copy. The amendment was verified
in an isolated nested session (virtual KWin with two outputs, private config,
cache, runtime directory and D-Bus, plus a manually started
`kactivitymanagerd`): before the fix both screens showed the flat fallback
color and Plasma logged `Couldn't open "/metadata.json"` once per screen; after
it only screen 0 switched, showed the frosted original package image with the
eyes, and the other screen and the original wallpaper settings were unchanged.

### Amendment, 2026-11-10: no flash when the plugin is swapped

Switching `wallpaperPlugin` destroys the old wallpaper and creates the new one;
nothing is painted behind a wallpaper, so any frame before the new wallpaper has
its picture is black (measured in an isolated nested Plasma session; a
transparent, `loading` Eyes wallpaper also left the screen black). Two defects
made showing Eyes flash:

- The first frames of a new Eyes instance showed the fallback `Color`, because
  the backdrop image loaded asynchronously (about 50 ms, three to four frames).
- The backdrop was resolved with `DayNightWallpaper`, whose `bottom` was the
  light variant (`...&darkMode=0`) while Plasma's own image wallpaper, which
  resolves through `MediaProxy`, showed `images_dark`. The picture changed
  brightness at the swap, and again on restore.

`main.qml` now resolves the backdrop with `Wallpaper.MediaProxy` exactly as
Plasma does and loads it synchronously (`Image { asynchronous: false }`), so the
first frame already contains the same picture. Only `BackgroundType.DayNight`
wallpapers keep `DayNightWallpaper` with `TransientImage`, because their
`image://` URLs need Plasma's image provider. Verified in the nested session: the
instance is created with the image `Ready`, frame 1 included, and the screenshots
before and after mounting show the same variant.

Not fixed by this: on restore, Plasma creates its own image wallpaper and paints
it only after its asynchronous load, leaving one black frame (seen in the same
session, about one capture interval). That is Plasma's behaviour, not Eyes'.
Removing it would require not swapping on every hide, for example by keeping
Eyes mounted (showing the plain wallpaper) for a grace period after hiding and
restoring only after a long idle. That conflicts with restoring the original
wallpaper as soon as Eyes is hidden, so it needs an explicit product decision.
