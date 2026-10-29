# ADR-010: Shared perspective for the whole expression

## Status
Accepted, 2026-10-29, following the request for the entire expression,
including accessories, to turn out of the screen plane with the gaze.

## Context
Gaze previously translated and reshaped the eyes while only props had a
local suggestion of perspective. Brows, stars and question marks lacked a
common orientation. Independent per-eye scaling would not give them a
coherent face plane, and a separate 3D renderer would duplicate the existing
Rive/Canvas vector composition and introduce another dependency.

## Decision
Keep the existing vector artwork and apply one projective face transform
after local expression, blink, accessory and light composition. The shared
simulation emits `frame.face` with yaw/pitch and a row-major matrix for
`Ry * Rx * Rz` followed by perspective division. Positive yaw brings the
left edge forward when looking right. Camera distance is 850 model units;
yaw/pitch targets are bounded to 0.38/0.28 radians. Existing tilt supplies
roll exactly once. Eye shapes remain continuous and primary.

Derive direction from the spring-driven gaze and mood. Separate damped face
springs respond behind the faster gaze, with no new random motion or clock.
Natural scans, explicit look commands, global desktop cursor and page cursor
use the same path. Reduced motion keeps a held orientation with higher
damping; paused simulation freezes the face and does not catch up later.

Use native projective composition: CSS `matrix3d` around the translated face
origin for browser Rive and Canvas, and Qt Quick `Matrix4x4` around the same
origin for desktop Rive and reference GLSL. Conjugate by the shared layout
scale and vertical stretch when operating in output coordinates. Flatten
output depth while keeping homogeneous w, avoiding implicit Qt camera or
CSS depth clipping differences. Keep existing full-resolution GPU targets,
MSAA and SMAA. All accessories lie inside the projection and outside blink
squash; clipped lights inherit the eye plane. Local prop relief and work
gestures continue inside this common transform.

Browser resizing uses layout dimensions (`clientWidth/clientHeight`), and
cursor/click mapping uses the untransformed stage. Reading transformed canvas
bounds for sizing would feed rotation back into layout. The caption and
wallpaper remain outside the face plane. Rive inputs and the artboard remain
unchanged; regenerate the asset and source manifest after changing the core.

## Implementation and validation
Unit tests verify perspective sign, mirroring, model/output equivalence,
gaze leading the face, interruption continuity, held reduced motion, pause,
all 28 states and the CSS matrix order. GPU tests cover all states looking
left and right, compare the native mapping against the shared matrix, check
actual eye pixels, accessory visibility and independence from blinking.
The reference GLSL path has a separate real-pixel projection regression.
Run Node/WASM tests, syntax checks, desktop build, GPU suite and real-window
DPR=2 suite. Verify the installed Plasma load and completion fade separately.

## Consequences
No dependency, full-screen window, input capture or new rendering clock is
introduced. This is a single tilted expression plane with perspective, not
volumetric eye sockets or extruded eye bodies. Composition can slightly
magnify the near side; physical-pixel silhouette coverage must continue to
pass at both tested densities. Human assessment remains necessary for
whether the motion reads as lively and natural.

## References
- [Qt Quick Matrix4x4](https://doc.qt.io/qt-6/qml-qtquick-matrix4x4.html)
- [CSS matrix3d](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/transform-function/matrix3d)

## Verification record
On 2026-10-29, all 78 Node/WASM checks, syntax checks and the desktop build
passed. The final offscreen GPU suite passed 304/304; the actual XWayland
DPR=2 suite passed 205/205. Native projection tests cover both horizontal
directions for every state; existing subpixel/coverage and fade checks remain
enabled. The six views in `docs/gallery/face-perspective.png` are actual
native Rive renders, including the question mark and editing props.

Installed the updated model and scenes, verified that installed files match
the build, and observed both `Eyes GPU wallpaper loaded` and
`Eyes Rive wallpaper loaded` on eDP-1 at DPR=2. Both running desktop
containments use `org.eyes.wallpaper`. An installed-host completion remained
happy and visible at two seconds and hidden at 5.4 seconds despite status
reads. At the time, there was one current user autostart entry; ADR-012 later
made login startup opt-in. Browser inspection found no rendering errors and
confirmed CSS projection in the immersive preview.
