# ADR-018: Wake from closed lids when the face is shown

## Status
Accepted, 2026-11-10. Revised the same day after the first version stuttered and
felt abrupt (see "First version" below).

## Context
Showing Eyes only faded a ready-open pair of eyes in over the frosted glass. The
face goes from hidden to shown at every work session start, so the arrival is the
most repeated moment of the product and had no performance.

## Decision
`EyeSimulation.wake()` starts a sequence inside the shared engine, so the browser
console and the Plasma wallpaper play the same one. `getWakeEnvelope(age)` is the
single timeline, in seconds of a dedicated wake clock:

| Seconds    | Movement |
|------------|----------|
| 0 – 0.20   | closed while the glass settles |
| 0.20 – 0.60 | a stir: lids lift to 82 % closed |
| 0.60 – 0.95 | a lazy sag back to 90 % |
| 0.95 – 1.70 | heavy lift to a 52 % slit |
| 1.70 – 1.90 | pause |
| 1.90 – 2.45 | the final opening |
| 2.05 on    | mood entry acting starts; soft 8 % over-wide stare; a breath toward the viewer (face lean 0.01); one eye leads by up to 6 % |
| 2.4 – 2.9  | a glance to the side and back |
| 3.00       | one settling blink |
| 3.40       | end |

Every lid movement is a quintic rise (smootherstep) that starts and ends at rest
and begins at the previous movement's end value, so velocity and acceleration are
continuous everywhere. The fastest lid speed is about 1.8 closure/s. Gaze (down 14,
left 5), head pitch and tilt follow the closed amount from a sleeping posture that
is pre-set in `wake()` while the face is still hidden, so there is no step at the
start. Brows and symbols fade in over 0.8 s from the final opening; reflections
(`flow`) follow the opening.

The closure is folded into the existing `blink` value (`max` with a real blink),
which Rive already maps to the lid node. No Rive input is added and the `.riv`
asset is unchanged.

Gating against start-up stalls: `wake()` enters a warming state with eyes shut.
The wake clock starts after `warmFrames` (8) consecutive smooth frames
(`dt <= 0.05`) while `wakeHold` is false, or after `maxWait` (1.5 s). The host sets
`wakeHold` until the Rive scene is loaded (`RiveEyeScene.advance`) and the
frosted glass has been rendered once (`frostSettled` in `main.qml`: 160 ms after
the wallpaper image leaves `Loading`). The wake clock advances at most
`maxStep` (0.04 s) per frame, so a stalled frame pauses the motion rather than
skipping it.

While asleep (before 2.05 s) the mood's clocks (entry acting, performance, fixation,
attention, pop) are re-anchored every frame, so nothing is performed, popped or
blinked behind closed lids and the performance starts from its first beat when the
eyes open; ages are never clamped, so nothing jumps when the wake ends.

Triggers: the wallpaper calls `wake()` when `shown` becomes true (a new wallpaper
instance also does so through the snapshot, which is the normal arrival); the
browser console calls it when the stage leaves `completion-hidden`. State changes
while already shown never replay it. `reducedMotion` skips it, and turning it on
mid-sequence opens the eyes at once.

## First version
Measured on that version (second differences per 60 Hz frame):

- The final opening was an ease-out cubic: after the hold, `blink` stepped from rest
  to 16 % of its travel in one frame, a velocity step.
- It coincided with a face squash impulse (bounce acceleration 0.528, the largest in
  the run), the accessories fading in (0.113) and the eye-height spring (0.209).
- The sleeping posture was set as a target at the first frame, so the head was
  yanked down in the first 0.1 s (pitch 0.144, gaze 0.364).
- The mood entry age was clamped during the wake and jumped by about a second when
  the wake ended.
- The scene's first frames after a show can stall (a 121 ms frame was seen once in
  the isolated GPU probe, not reproduced in later runs); the sequence started
  before that finished.

The revision removes the impulse, the cubic start and the clamp, pre-sets the
posture, gates the start, and slows and enriches the sequence. Same measurement
afterwards: pitch 0.024, gaze 0.033, bounce no longer peaks at the opening, blink
acceleration only at the ordinary settling blink.

## Consequences
- `sourceHash` in `assets/eyes/manifest.json` covers `eyes-core.js`, so it changed
  although the generated Rive scene did not. The Rive CLI was unavailable, so the
  hash was updated after confirming the generator emits a byte-identical
  `scene.rml` before and after the change (checked against the committed core);
  `assetHash` is untouched. Re-run `npm run eyes:author` with the CLI at the next
  authoring change.
- Tests: chain structure and bounded speed/acceleration of every envelope channel;
  warm-up, hold, timeout and stalled-frame behaviour; per-frame smoothness of blink,
  gaze, head, lean, accents and reflections; sleeping posture and details (glance,
  asymmetry, breath); entry acting held and no jump at the end; reduced motion.
- The real desktop was not re-verified here: gating on `frostSettled` and the
  Plasma image status cannot be exercised outside a running Plasma session. After
  `npm run desktop:install`, check on the real desktop that `eyes show` opens
  smoothly and that the log still shows `Eyes Rive wallpaper loaded`.
