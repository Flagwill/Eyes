# ADR-016: Window-ratio vector target and per-frame CPU trimming

## Status
Accepted, 2026-11-02. Extends ADR-008 (demand-driven rendering), ADR-014/015
(batching, preclipped meshes). Expression geometry, timing, attention, the
shared `.riv`, hardware MSAA and the 60 FPS default are unchanged. The wallpaper
still renders continuously while visible, including behind translucent or
blurred windows; nothing here gates rendering on window occlusion.

## Context
After ADR-015 the GPU frame was small (about 2 ms on the development laptop) but
the process still burned roughly a fifth of a core. A stack-sampling profile of
the render thread (about 320 busy samples) and of the GUI thread showed:

- about 37% of render-thread busy time in `rive::LinearAnimation::
  reportKeyedCallbacks`, called from every blend animation on every advance,
  including the ~140 whose mix is zero;
- about 27% in `qTriangulate`, much of it re-triangulating the same eye outline
  once per clipped highlight or reflection;
- GUI thread time dominated by building 140 string keys per frame
  (`ExecutionEngine::newString`, identifier interning, GC) and by integrating
  ~170 springs that sit at rest.

Separately, KDE at scale 1.4 reports `Screen.devicePixelRatio == 2` (Wayland
rounds the screen ratio up) while the wallpaper window renders at the
compositor's fractional ratio 1.4. `RiveEyeScene.qml` sized the multisampled
vector target from the screen ratio, so it was about 2x the pixel area the output
needs, then was resampled down.

## Decision
1. **Window ratio.** `renderPixelRatio` uses `Window.window.devicePixelRatio`
   (Qt 6.11+, the window's effective ratio) and falls back to
   `Screen.devicePixelRatio` when the property or window is missing. The
   `1/ratio` scale back to logical coordinates is unchanged.
2. **Skip keyed callbacks for blend animations.** `cmake/RiveRuntime.cmake`
   builds a patched copy of the header-only `blend_state_instance.hpp` that passes
   no callback reporter to `LinearAnimationInstance::advance`. The patched
   directory precedes the downloaded includes for every consumer; the downloaded
   source stays verbatim and the match is guarded against ambiguity. Animations
   still advance and apply exactly as before. Upstream advances zero-mix
   animations deliberately so events can fire; Eyes' asset has none, and
   `tests/rive.test.mjs` fails if any expression reports a keyed event.
3. **Clip triangulation cache.** `cmake/rive-clip-cache.cpp` (spliced in by
   `cmake/RiveGeometry.cmake`) caches triangulated clips in the renderer, keyed by
   the exact clip stack (each path and matrix, compared by value). A hit returns
   what recomputation would produce bit for bit; changed content cannot match.
   Eight entries are kept, including across frames.
4. **Shared simulation.** Rive input names are precomputed once
   (`RIVE_VARIANT_KEYS`). `Spring.step` returns immediately when value and
   velocity are within 1e-9 of rest on the target, snapping the residue. Most of
   the 28 expressions' entry, action and expression weights are at rest at any
   time. The Rive asset, its generated source and the input names are unchanged;
   only `manifest.json`'s `sourceHash` (a hash of the source text) is refreshed.

## Validation
- `npm test` (87), `npm run check`, desktop build, `eyes-geometry-test` and the
  full Qt GPU regression (304 checks) pass.
- 112 actual-GPU frames (28 states, each at two rest times, toward a pointer and
  blinking) were captured before and after: the plugin changes (2, 3) differ in
  **0 pixels**; the simulation change (4) differs in **0 pixels**; two captures
  of the unchanged build also match, so the renderer is deterministic. The
  target-ratio change (1) alters 1.55% of pixels (edge coverage, max 77/255 on a
  blink-line frame) because the target is now rendered at native density.
- The simulation change was also compared numerically against the previous
  implementation over all 28 states for 5,040 frames with pointer, look, blink
  and mid-run emotion changes: max input difference 1.1e-8 (inputs are 0-100),
  max pose difference 1e-9.
- Measurements and method are in
  [the performance report](../performance/2026-11-02-render-cost.md).

## Consequences
- Item 1 needs Qt 6.11 to benefit; older Qt keeps the previous behaviour.
- Item 2 is valid only while the asset has no Rive events or audio. The test
  guards the shipped asset; revisit before authoring events. Revisiting the
  pinned runtime must re-check the guarded header match.
- Item 3 holds a few triangulated clips per renderer; it adds an O(path
  elements) comparison per clipped draw on a miss.
- Item 4 changes spring trajectories by at most about 1e-9, far below pixel
  resolution and the 1e-7 weight thresholds already in the model.
- At fractional scales the vector target is now 1:1 with output pixels, not
  supersampled. Open-eye edges remain one-pixel anti-aliased; very thin closed-eye
  lines can appear slightly fainter or wider depending on sub-pixel phase.
