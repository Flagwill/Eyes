# ADR-019: The wake is a glimpse, not a slow rousing

## Status
Accepted, 2026-11-11. Replaces the timeline and the lid choreography of ADR-018.
ADR-018 still governs the triggers, the dedicated wake clock, the start-up gating
(`warmFrames`, `wakeHold`, `maxWait`, `maxStep`), the re-anchored mood clocks and
the rule that the wake adds no Rive input.

## Context
After living with ADR-018 the user found the wake dragging and flat, and asked for
an arrival that is striking and stirs the viewer. Measured on that version:

- The eyes were not open until 2.45 s of wake clock. Of that, 1.7 s showed a thin
  slit (stir, sag, heavy lift, pause), which reads as grogginess, not arrival.
- The lowered gaze and head followed the lids exactly, so lids, gaze and head
  rose as one block, with no overlap.
- A filmstrip rendered from the shipped `.riv` showed that two details never
  reached the product path: the 8 % over-wide stare and the one-eye-leads
  asymmetry were applied to the pose springs, and Rive does not read the pose. It
  receives blend weights, `blink`, gaze, `accents`, `flow` and the face matrix.
  Only the Canvas fallback and the GLSL reference showed them.

## Decision
`getWakeEnvelope(age)` remains the single timeline, about 1.9 s:

| Seconds     | Movement |
|-------------|----------|
| 0 – 0.10    | closed line, lowered and turned aside (gaze down 13, left 9) |
| 0.10 – 0.30 | a flutter: lids lift to 80 % closed |
| 0.30 – 0.48 | they press back to 93 %: the anticipation |
| 0.48 – 0.76 | the opening, 0.28 s, peaking at 6.2 closure/s |
| 0.52 on     | mood entry acting starts |
| 0.56 – 1.02 | the gaze lifts to the viewer; head pitch and yaw trail it on their springs |
| 0.60 – 1.75 | the wide look: in over 0.30 s, held 0.30 s, out over 0.55 s |
| 0.64 – 1.84 | a lean toward the viewer (face scale +0.014) |
| 0.76 – 1.71 | the lift carries past the viewer (right 3.5, up 2.5) and settles |
| 0.76 – 1.36 | brows and symbols fade in |
| 1.50        | one settling blink |
| 1.90        | end |

- **Overlap instead of one block.** The gaze has its own channel (`droop`) and
  starts lifting only after the lids have begun to part, so the eyes open still
  looking down, then look up at the viewer. With a cursor or a directed look, that target
  is where the lift lands and the carry past it is dropped.
- **The wide look is real geometry on every renderer.** At the widest point 30 %
  (`WAKE.inhale`) of idle's first gesture pose is mixed in. Rive already bakes it
  as `idleact` (idle plus its widened inhale at double strength, no symbols), so
  the wake scales every blend weight by `1 - share` and adds the share to
  `idleact`; the spline renderers blend the same pose into the lid targets. A
  narrow mood therefore opens wide and then narrows into itself. Smiles and
  drowsy moods (`happy`, `complete`, `sleepy`) are exempt, so the smile band
  keeps its even thickness.
- **Fast by duration, never by a kick.** Every channel is still a quintic rise or
  a product of quintic rises that starts and ends at rest. No impulse, no
  ease-out start. Measured per 60 Hz frame (second differences): `blink` 0.019
  at the hardest frame of the opening, against 0.14 for an ordinary blink;
  the opening's top speed is 6.2 closure/s against 7.5 for the reopening half
  of an ordinary blink.

The `.riv` asset and its inputs are unchanged.

## Consequences
- `sourceHash` in `assets/eyes/manifest.json` changed because it covers
  `eyes-core.js`. The Rive CLI was unavailable; the generator was run with a
  failing CLI stand-in before and after the change and emitted a byte-identical
  `scene.rml`, so `assetHash` is untouched. Re-run `npm run eyes:author` with the
  CLI at the next authoring change.
- Tests (`tests/eyes.test.mjs`): the envelope has no velocity or acceleration
  step on any channel, opens within 0.8 s and ends within 2 s, and opens slower
  than a blink reopens; per-frame smoothness of every output channel for three
  moods, including the effective Rive share of the inhale pose; lids lead and the
  gaze follows; the carry past the viewer and its absence with a pointer; the
  inhale reaches both Rive weights and the pose, and is skipped on a smile or a
  drowsy face; gating, stalled frames and reduced motion as before.
- Verified here: Node tests, a filmstrip of the sequence rendered from the
  shipped `.riv` in headless Chrome for four moods, and the sequence run inside
  Qt's QML JavaScript engine from the built wallpaper bundle. Not verified here:
  the feel in motion on the real Plasma desktop. After `npm run desktop:install`,
  check `eyes show` there.
- Tuning: `WAKE.lids` (the last row's duration is the opening speed),
  `WAKE.inhale` (how wide), `WAKE.wide[2]` (how long the look is held),
  `WAKE.droopSide` and `WAKE.lift` (how far and how late the gaze turns to the
  viewer).
