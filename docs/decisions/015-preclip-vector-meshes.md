# ADR-015: Preclip vector meshes and resolve once

## Status
Accepted, 2026-10-30. Extends ADR-014's compatible batching with preclipped
vector geometry, a combined clear/draw pass and lazy blend resources. Retains
the Rive state machine, shared asset, output density and hardware MSAA, with
automatic SMAA fallback on low-sample backends. ADR-017 later caps the sample
count at four.

## Context
After ADR-014, full-sized multisample colour attachments still had to resolve
at every change of clip. Natural reflections introduced additional clipped
draws. The bridge also allocated three multisample colour surfaces even when
the scene used only source-over paint and never read the destination.

The user authorized a deeper reconstruction and subsequently accepted subtle
rendering differences. The permitted trade-off is small raster rounding
differences; expression geometry, timing, attention and perceived materials
remain part of the contract.

## Decision
Intersect the existing source and clip triangle meshes during Rive path
preparation. `desktop/eyes-triangle-clip.h` uses triangle/triangle intersection
with bounding-box rejection, independent of triangle winding. It clips in
artboard space while interpolating each generated vertex's original paint
coordinates. The existing GPU shader therefore still computes the same
linear/radial gradients in local paint space. The outer shared face projection
and pixel density do not change.

Rive supplies affine `Mat2D` transforms, and its triangulator supplies filled,
non-overlapping clip triangles. No curve flattening, pixel rasterization or
replacement expression model is added. The shipped highlights/reflections
are rectangles, so their source meshes contain only two triangles each. Work
scales with source/clip triangle count rather than output pixel count. Keep
this workload assumption in mind if future assets introduce complex clipped
paths; bounding-box rejection is already applied before intersection.

Vector paths now have their clip baked into their geometry. ADR-014's batching
therefore paints the shipped scene in one colour pass without repeated stencil
passes. Start that pass with the existing clearing target, resolving its colour
only after painting. Empty scenes still clear, and destination-reading blends
retain their ordered individual passes. Image paths keep the existing stencil
path.

Allocate only colour surface A initially. B and the intermediate surface are
created when a prepared, active node actually needs a destination-reading
blend. Until then, unused bindings alias A or the existing dummy texture.
If a later frame requires B, rebind held composition and reinitialize SMAA
before submitting it. Preserve the original sampling, shader layouts and
resource cleanup on resize/hide.

Keep adaptations in guarded CMake-generated LGPL sources. The browser and
Rive asset are unchanged. Add direct geometry coverage/paint-coordinate tests
alongside the existing actual-GPU tests.

Use an `Automatic` native antialiasing mode. At four or more MSAA samples,
skip the three additional full-target SMAA passes and their textures. Below
four samples, including the existing single-sample Metal fallback, keep SMAA.
Explicit `SMAA` and `None` modes retain their meanings for reference/testing.
The user explicitly accepted subtle quality differences, so this policy trades
the extra edge filter for lower GPU work without reducing output density.

## Alternatives
The research and measurements are recorded in
[the performance report](../performance/2026-10-30-mesh-clipping.md).

Rive's current native renderer, Vello's Sparse Strips/compute renderers and
ThorVG were considered. Their maintained sources support reducing intermediate
work and preparing compact geometry, but adopting any of their full backends
would require a new Qt/Rive adapter and different image-quality validation.
This implementation borrows the CPU geometry/GPU painting split without adding
a new graphics device, Rust/wgpu dependency or copying their source.

A prototype that combined changing stencil references in one pass changed
dynamic highlight output and was rejected. Preclipping avoids that dependency.
Unconditionally disabling antialiasing was not selected: geometry retains
hardware coverage and lower-sample backends retain the additional edge filter.

## Validation
Test coverage area, disjoint/shared edges, empty and degenerate masks, reversed
winding and rotated/nonuniform paint transforms. Compare all 28 actual-GPU
states at rest, natural action, pointer turns, blinking and fading at DPR=2.
With explicit SMAA, the 140-frame comparison found 1,333 changed pixels out of 437,472,000, with
a maximum one-level difference in any 8-bit colour channel; no larger changes.
These are rounding differences at the altered triangle subdivisions.

The final Automatic comparison changed 0.08342% of pixels, predominantly the
edge/line filtering affected by SMAA. Its mean absolute channel error was
0.002685 on an 8-bit scale, with a maximum local error of 65. It is not
pixel-identical; the detailed report keeps this trade-off separate from the
mesh-only rounding result. Both the explicit-SMAA mesh configuration and
Automatic default passed the 304-check GPU regression.

Run the full Node/WASM checks, Qt GPU regression and actual installed Plasma
comparison. Use persistent KDE display inhibition and record physical output
power throughout sampling. Report GPU engine time and memory alongside Qt GPU
frame time and CPU, so CPU preprocessing is visible in the comparison.

## Consequences
The small vector scene trades inexpensive triangle preparation for fewer GPU
passes, resolves and resident multisample targets. It retains per-path draw
calls and the existing shaders. This is a scene-specific workload improvement,
not an assertion that CPU clipping is preferable for every vector scene.
