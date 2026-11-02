# ADR-017: Cap the native MSAA target at four samples

## Status
Accepted, 2026-11-02. Amends ADR-015's sample selection (previously the highest
supported of 8, 4 and 2). Frame rate, output density, expression geometry and the
Automatic antialiasing policy (no SMAA at four or more samples) are unchanged.
The user approved this trade-off and asked that the 60 FPS default stay as is.

## Context
After ADR-016 the native vector target matches the window's pixel density. Its
colour and depth/stencil attachments are multisampled, so memory and bandwidth
scale with the sample count. On the development GPU the highest supported count
is eight.

## Decision
Add the CMake cache option `EYES_RIVE_MAX_MSAA` (2, 4 or 8; default 4), passed to
the plugin as a compile definition. `cmake/RiveAntialiasing.cmake` skips
candidates above it, so the target uses the highest supported count at or below
the cap. Automatic mode keeps its rule: hardware MSAA alone at four or more
samples, SMAA below four. Build with `-DEYES_RIVE_MAX_MSAA=8` for a quality
reference.

## Validation
- Full Qt GPU regression: 304 checks pass (twice in a row). One earlier run
  failed a wall-clock clock-rate test right after boot (`tst_clock`, no Rive
  involvement); it passed five times alone and in the two reruns.
- 112 actual-GPU frames (28 states, each at two rest times, toward a pointer and
  blinking; output scale 1.4) at 8x versus 4x: 0.30% of pixels differ, 0.023%
  by more than 16/255, maximum channel difference 58/255. Differences are edge
  coverage levels; at 8x magnification a shallow-slope edge shows slightly coarser
  steps, at 1:1 they are hard to see.
- Interleaved benchmark (five runs each, editing, 60 FPS config, scale 1.4):
  GPU frame time 1.34 -> 0.86 ms (-36%), GPU engine time 1.40 -> 0.95 ms per frame
  (-32%), process GPU memory 332 -> 205 MiB (-127 MiB); CPU per frame unchanged
  (3.01 vs 3.09 ms, within noise). Method as in
  [the render-cost report](../performance/2026-11-02-render-cost.md); not yet
  measured on the real Plasma desktop.

## Consequences
Edge anti-aliasing has five coverage levels instead of nine, so near-horizontal
edges can show slightly coarser steps. GPUs that only support two samples still
get SMAA. Restoring eight needs a rebuild with the option set.
