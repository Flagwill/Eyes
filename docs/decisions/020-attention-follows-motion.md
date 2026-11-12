# ADR-020: Attention follows motion, not position

## Status
Accepted, 2026-11-12. Implemented in `eyes-core.js`, with the motion script, the
README and the project memory following it.

## Context
The user asked for eyes that feel more alive. A review of the shipped behaviour
found that the scripted gaze never reached the desktop:

- KWin reports the global cursor and the last coordinate is kept for good, so on
  the desktop `pointer.active` is always true once the cursor has moved.
- While a pointer is active the simulation used it as the only gaze target. The
  idle glances, the thinking look up and aside, the reading scan and every
  activity's gaze score were replaced by a stare at wherever the cursor was
  parked, for the whole session.
- The same happened in the debug console whenever the pointer stayed on the page,
  so the glance amplitudes had been tuned without being seen much. At default
  energy an idle glance moved the eyes 4 model units, under 3 % of an eye width.

## Decision
- A cursor holds the gaze while it moves and for `attentionHold` seconds after it
  stops (4 by default; `Infinity` restores the permanent hold). Then an interest
  weight eases to zero in about half a second and the target pose blends from the
  attention pose back to the mood's own pose, gaze and ambient lean.
- The last cursor position is still retained. It is never replaced by the origin
  or by a timeout fallback; only the weight changes.
- When the cursor moves more than 2.5 units again, interest returns as a dart
  (about 0.15 s). If the eyes had let go, they also widen once: 16 % of idle's
  baked inhale pose (`idleact`), 0.14 s in, 0.1 s held, 0.45 s out. This reuses
  the wake's mechanism, so Rive needs no new input and the asset is unchanged.
  A smile and a drowsy face keep their shape.
- Without natural motion (reduced motion, or natural actions switched off) there
  is no acting to return to, so the gaze stays on the cursor as before.
- `wake()` restarts the hold: the first look after appearing goes to the cursor.
- Ambient glances are larger so that they read at desktop distance: idle up to
  10.5 / 5.6 units, the emotions 4.5 to 10, `waiting` 5 to 6. They remain well
  under the cursor's range of 40 / 28.

## Consequences
- The README and motion script no longer promise that a parked cursor is watched
  indefinitely. Tests that measure micro-acting on a held target set
  `attentionHold = Infinity`.
- Letting go and looking back are large gaze shifts, so the existing saccade
  rule may cover either with a blink.
- `eyes-core.js` changed but nothing the Rive generator reads did: the generated
  `scene.rml` is byte-identical before and after, so `eyes.riv` was kept and only
  `sourceHash` in the manifest was refreshed. No Rive CLI was available to
  re-run `npm run eyes:author` on this machine.

## Tuning
`ATTENTION` in `eyes-core.js` (`hold`, `widen`, `notice`), the interest spring in
`EyeSimulation.update`, `IDLE_GLANCES` and `getAmbientGaze`.
