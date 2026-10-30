# ADR-014: Batch compatible vector passes

## Status
Accepted, 2026-10-30. Extends ADR-008's scheduling and retains the output
resolution, MSAA, SMAA, shared animation clock and material of ADR-005/006.
ADR-015 later preclips vector meshes, folds clearing into the first pass and
allocates destination-reading blend surfaces on demand.

## Context
The native bridge starts and ends a render pass for every Rive path. Each
pass preserves colour, clears stencil and resolves the entire multisampled
eye target, even for a small accessory. A simple drawing therefore incurs
repeated large texture resolves and attachment traffic on an integrated GPU.
The wallpaper blur is already cached and does not need to be changed.

## Decision
Upload each active source-over node's existing private buffers before the
vector passes. Batch consecutive nodes only while their clip flag and complete
triangulated clip geometry are identical. Keep the original paint order,
pipelines, stencil reference, sample count, gradients and blend factors.
Start a fresh pass when the clip changes, including transitions between
clipped highlights and unclipped accessories. This preserves the upstream
stencil clear semantics at every change of coverage. All nodes share the
renderer-owned combined matrix; clip vertices are already in artboard space.

Keep destination-reading blend modes on the existing individual/ping-pong
path, closing an open batch before using it. Continue with the resulting
current target afterward. Recycled nodes submit neither updates nor draws.
SMAA and final premultiplied composition run exactly as before. The shared
asset, browser renderer and motion design do not change.

Use the existing guarded CMake adaptation of the pinned LGPL bridge; do not
edit downloaded sources. `cmake/RiveBatching.cmake` extends the sources already
adapted by the scheduling patch. Normal configuration writes a generated file
only when its contents change.

## Validation
Compare baseline and candidate GPU captures at DPR=2: all 28 states, each at
rest, in natural motion, turned toward a pointer, blinking and fading. The
final implementation produced **140/140 byte-identical RGB pixel arrays**.
Keep the existing full Qt GPU regression, including all poses and fractional
edge offsets. Strengthen the overlapping magnifier regression: a highlight's
stencil must never hide later accessory pixels drawn over an eye.

Use an explicit, uninstalled `eyes-render-benchmark` target for repeatable
GPU timestamp measurements. It discards a two-second warm-up, reports actual
window dimensions, DPR, frame rate and GPU time, and fails when timestamps
are unavailable. Timing follows Qt's
[command-buffer timestamp contract](https://doc.qt.io/qt-6/qrhicommandbuffer.html#lastCompletedGpuTime).
Also measure the installed Plasma wallpaper with the physical output on;
an extinguished display can keep the model clock running without submitting
GPU work. Results and reproduction steps are recorded in
[the performance report](../performance/2026-10-30-render-batching.md).

## Consequences
Compatible paths share attachment work while retaining their separate draw
calls and existing shaders. Different clips still need different passes.
This deliberately limits batching to cases that preserve the old output.
The hidden scene lifetime and opt-in startup rules remain those of ADR-008,
ADR-011, ADR-012 and ADR-013.
