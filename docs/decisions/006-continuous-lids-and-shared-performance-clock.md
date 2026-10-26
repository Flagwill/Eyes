# ADR-006: Continuous lid curvature and one performance clock

## Status
Accepted, 2026-10-25. Updates ADR-004's product interpolation and ADR-005's
looping eyelid playback. Retains the upstream MIT kernel, Rive state machine,
Plasma wallpaper architecture and shared layout.

## Context
The eyelid curves still looked uneven despite working pixel antialiasing.
The replicated endpoint nodes of the original Catmull–Rom construction
reverse the curvature near a convex lid's shoulders. Increasing render
resolution cannot repair that geometry.

Rive also ran its eyelid timelines independently of the host's gaze clock.
Switching an expression could blend into the middle of a gesture while gaze
started from its beginning. Different pause and playback phases produced
different eyelid performances for the same model state.

## Decision
Use a clamped C2 cubic solver for the shared five lid nodes. The endpoint
tangents derive from the lid bend and slope; solve the three interior tangents
as a tridiagonal system. Position, tangent and second derivative agree across
the four intervals. This preserves the existing parameter vocabulary and
sharp rectangular corners. Keep the original kernel and compiler untouched
for upstream equivalence; attribute the new solver as an Eyes extension.
Author Rive handles from the same coefficients as Canvas and the GPU reference.

Replace independently looping eyelid timelines with five static basis poses
per emotion: still, entry, primary action, partner follow and resolution.
Three complementary gesture profiles contain local upper-lid slopes, tension,
opening, lift and spacing. Author each gesture at twice its delta and use at
most half-weight per cue, so overlapping gestures remain a convex blend.
The shared model drives their quintic envelopes and springs, gaze phrases,
entry decay and reflection phase. Rive still performs the actual interpolation
and rendering. Interruptions fade outgoing gestures; repeated states preserve
the current phrase. Pointer attention continues to take priority over ambient
glances, and focus stays restrained.

Reflection visibility and phase use separate numeric inputs. Its surface anchor
follows the eyelid basis poses; the actual eye path clips both reflections.
Natural-motion pauses preserve phase instead of advancing an invisible loop.

## Validation
Test source-curve position, first derivative and second derivative at every
internal knot; require convex smile shoulders and constant band thickness.
Retain upstream parity and all-expression nonintersection checks. Native GPU
tests sample nine horizontal positions on both edges of all eight expressions.

Feed identical model inputs into real Rive instances with different playback
phases and advance rates; their eye transforms must match. Check actual entry
poses, interrupted transitions, pause behavior and source/asset hashes. Inspect
the live gallery and a recording of real rendering, since automated geometric
checks do not establish human emotion-recognition accuracy.

Verified locally on 2026-10-25: 49 Node/WASM/service checks, 70 GPU checks and
39 additional high-DPI checks passed. The installed Plasma component loaded at
`dpr=2`, and global cursor attention remained active. With temporary recording
and parallel gallery rendering stopped, desktop logs reported about 59.9–60.0
fps and 17.6–18.1 ms p95 intervals. Completion showed happy at two seconds and
hid afterwards despite status reads. Logging was disabled and hidden idle
restored after verification. The 16-second real-rendering recording is saved
in `docs/gallery/eyes-smooth-performance.mp4`.

## Consequences
The state-machine input set gains follow, resolve and reflection-phase inputs;
the QML adapter and shared asset must be upgraded together. Runtime does not
need a second timeline scheduler. The pose-only asset is substantially smaller
than the previous sampled eyelid timelines. Updating poses or the solver still
requires local regeneration and native pixel checks.
