# ADR-007: Shared vector expression accessories

## Status
Accepted, 2026-10-26. Updates the previous default of showing eyes alone,
following the user's explicit request for brows, question marks, stars and
alert cues. Retains ADR-006's continuous lids and single performance clock.

## Context
The abstract eyes need more immediately readable emotion cues. The old
optional Canvas decorations did not appear in the actual Rive product, and
font-based question marks and Z characters could differ between platforms.
A separate QML overlay would duplicate expression behavior and could drift
from the browser or blink with the lids.

## Decision
Define filled, font-free vector paths and accessory transforms in the shared
core. Compile the same paths into the shipped Rive asset and replay them in
Canvas fallback. Focus uses inward brows; curiosity uses a small question
mark; confusion uses asymmetric brows and a larger question mark;
thinking uses no accessory; happiness uses two stars; surprise uses short
alert strokes; sleepiness uses two small Z shapes. Idle stays quiet.

Every static expression basis keys every accessory's transform and opacity,
including zero-opacity states. The existing spring weights therefore blend
outgoing and incoming cues through interruptions. Brows anchor to the upper
lid and stars respond to the smile's lift. Accessories inherit the face's
gaze, layout and tilt, but stay outside the blink squash nodes. They have no
independent timeline, random drift or persistent sparkle cycle. Reduced motion
keeps the held cues; pause freezes the same model inputs.

Enable the layer by default. The shared `accents` flag, also exposed as a Rive
numeric input, permits explicit opt-out in both renderers. Keep colors in the
eye's purple family and opacity below the eyes' solid fill.

Before the geometric revision below, brows were about 114% of eye width with
an approximately 18-unit inner head, a shallow outer arch and a tapered tail.
Mirror the same filled cubic outline for both sides. Their angle followed
the upper lid, and placement reserves clearance for the full contour, including
the portions extending beyond the eye. They retain the eye's purple and the
shared expression springs. Only focus and confusion show brows; curiosity
retains its question mark. Earlier straight-cut short-brow previews remain in
`docs/gallery/` as historical snapshots. The wider-brow revision passed 50
Node/WASM/service checks and 79 GPU checks, plus syntax checks and desktop
build. A separate contour sweep of 1,970 motion/gaze poses retained a minimum
11.29-unit brow-to-lid gap and a projected brow width greater than eye width.
Real-Rive previews are `brows-shaped-focused.png` and
`expressions-shaped-brows.png` in `docs/gallery/`.

### Geometric revision, 2026-10-28

The soft, tapered cubic brows were replaced by a faceted straight-edge
silhouette: a solid inner head, one shallow angular crest and a sharp outer
tail. The 108% eye-width remains longer than the lid without turning into a
second dominant shape, and the purple is lifted slightly toward the eye's
surface highlight. The same shared expression springs still rotate each brow
with its lid, so focus and confusion remain asymmetric and responsive.

Thinking intentionally has no overlay. Its compact lids and restored side-up
gaze carry the cognitive cue without a prop competing with the eye surface or
turning the expression into a costume.

Rive paints earlier artboard children above later siblings. The accessory root
therefore precedes the eye nodes in the generated artboard, matching the
Canvas fallback's explicit final draw. This keeps brows and symbols above the
eye surface wherever their authored bounds overlap.

Accessories stay outside the blink node, fade with the shared expression
weight and use no independent motion clock.

## Validation
Load the actual WASM asset and compare accessory transforms against all shared
poses; check pause and the visibility input. Native GPU tests sample each
expression's external cue, clear it with the shared switch, require an
intermediate question-mark fade, and check unchanged frames during a blink.
Retain all eye contour, antialiasing and equal-thickness tests. Review the real
gallery as visual judgment remains separate from pixel tests.

Verified on 2026-10-26: 50 Node/WASM/service checks and 79 native GPU checks
passed, along with syntax checks and the desktop build. The installed Plasma
component loaded the new asset at `dpr=2`. Completion stayed happy/visible at
two seconds and was hidden at 5.5 seconds despite intervening status reads.
The separate XCB high-DPI window test timed out before any test output in the
current session; it is not counted as passing. Actual DPR=2 loading does not
replace that pixel regression. Temporary performance logging was disabled and
hidden idle restored. `docs/gallery/expressions-accessories.png` records eight
verified real-Rive browser canvases.

Verified after removing the thinking accessory on 2026-10-28: 55
Node/WASM/service checks and syntax checks passed. The offscreen RHI suite
passed 88/88 and the XCB 2x DPR Rive suite passed 50/50. The shared regression
also asserts that no `glasses` design or `glassesPush` pose remains, and that
accessories stay unchanged during a blink. The live gallery rendered all eight
expressions from the rebuilt asset; the current snapshot is
`docs/gallery/expressions-geometric-accessories.jpg`.

The installed Rive asset matched the repository at SHA-256
`207da5bc5871f8cdb2ffa21d75506ae22413973e7703cb5263983149d3c31d08`.
Both Plasma desktop containments and the live PlasmaShell state reported
`org.eyes.wallpaper`; the journal recorded `Eyes Rive wallpaper loaded eDP-1
dpr=2`. A real desktop capture confirmed the eyes, geometric brows and frosted
wallpaper layer were visible, after which Eyes was returned to hidden idle.

## Consequences
The asset and QML interface gain one numeric input and must be installed
together. There are no new fonts, image assets or rendering dependencies.
Accessory geometry and semantics must continue to live in the shared core;
the reference GLSL scene's small Canvas is only a compatibility path.
