# Rive runtime integration

Eyes uses actual Rive state machines and vector renderers, not a mathematical
port branded as an engine replacement. Both hosts consume `assets/eyes/eyes.riv`.

| Component | Version | License |
| --- | --- | --- |
| [Browser Canvas advanced runtime](https://github.com/rive-app/rive-wasm) | npm `@rive-app/canvas-advanced@2.47.0`, integrity in package-lock.json | MIT |
| [Qt Quick RHI bridge](https://github.com/basysKom/RiveQtQuickPlugin/tree/4e139e0d3ed7ca69f182feecfee5ae6b18c41c90) | `4e139e0d3ed7ca69f182feecfee5ae6b18c41c90` | LGPL-3.0-or-later |
| [Native animation runtime](https://github.com/rive-app/rive-runtime/tree/8a54c80a217d2cc651c4d52385ceb6090ff8c6f1) | bridge's supported pin `8a54c80a217d2cc651c4d52385ceb6090ff8c6f1` | MIT |

The native runtime is intentionally pinned to the bridge's version; it is not
claimed to support all features in the latest official runtime. Assets use
legacy numeric state-machine inputs, paths, gradients, clipping and timelines.
No Luau, custom GPU scripts, fonts, images, remote assets or view-model binding
are needed. Pure vector assets compile locally without script signing.

`cmake/Rive.cmake` downloads immutable archives with SHA-256 checks, builds only
the needed sources, and installs a separately replaceable `libEyesRive.so`.
Original source and license notices are retained. Our `desktop/rive-settings.h`
registers the upstream enum gadget with Qt 6. Our LGPL precision replacement
`cmake/rive-path-tail.cpp` triangulates unit-space paths at an adequate scale;
otherwise the bridge flattens or quantizes subtle eyelid curves before their
parent rig enlarges them. The rest of the upstream path implementation is
copied verbatim into the ignored build directory.

Input names are lowercase because the bridge lowercases QML property names
when connecting notifications. Interactive input and hover are disabled by the
wallpaper component. Native targets use the actual scene output dimensions,
including device pixel ratio, not a 560x340 texture enlarged to a desktop. GPU and browser tests execute the
real runtimes and check their resulting geometry / pixels.

The wallpaper keeps SMAA enabled and adds geometry coverage independent of
Plasma's window target. `cmake/RiveAntialiasing.cmake` generates an adapted
render node from the pinned LGPL source, with unambiguous replacement guards.
The offscreen colour, stencil and vector pipelines use the highest supported
sample count among 8, 4 and 2 (single sample on unsupported/Metal backends).
The final pipeline still matches Qt's actual output target. Final sampling is
linear and uses premultiplied source-over blending to avoid moving stair steps
and dark fringes. Path normalization uses 4096 units to retain curve detail
when enlarged. No downloaded source is modified.

`cmake/RiveScheduling.cmake` adapts the pinned bridge for resident operation.
The build mirrors upstream files into an ignored adapter directory so all
translation units use the same adapted headers. The shared model explicitly
requests item updates; the bridge does not run its own animation loop or poll
inputs back into QML. Input values are initialized when a state machine is
attached. RHI `prepare()` submits vector passes on Qt's current command buffer
after preparing the current artboard, followed by SMAA and final composition.
Held frames reuse the vector texture while composition still updates opacity
and transforms. This removes the upstream extra offscreen frame and prevents
the last pose from remaining stale when model updates stop. See ADR-008.

The GPU regression covers all eight expressions at three fractional pixel
positions, requires most sampled columns to have intermediate coverage, and
limits the transition to two physical pixels. A fade regression checks that
alpha is applied once. No silhouette blur or glow is added.

`npm run desktop:hidpi:test` checks the native renderer with doubled pixel
density on X11 / XWayland. Its window fits the monitor so the window manager
does not crop it and invalidate screenshot coordinates. The offscreen Qt 6.12
backend's scaled capture was independently checked with a plain rectangle and
is unsuitable for this particular check.

The official Rive CLI 1.7.0 and editor are authoring tools, **not** the open-source
runtime. The CLI is not installed or downloaded by normal Eyes builds. To
regenerate the asset, install it separately from Rive's official distribution
and run `EYES_RIVE_CLI=/path/to/rive npm run eyes:author`. This invokes only local
verify/build operations with analytics disabled, without login or upload.
Generated RML is in `build/rive/scene.rml`. Commit the resulting `.riv` and its
manifest together with shared source changes; `npm test` detects stale assets.

## Expression accessories

The shared asset also contains the font-free vector paths from
`EyesCore.accentDesigns`: brows, question mark, stars, hollow glasses, alert
marks and small Z shapes. `getAccentStates` anchors them to each authored pose.
All five bases key every accessory transform and opacity so interrupted
expression changes fade cleanly. A separate `accents` input controls the whole
layer (on by default). It sits outside blink nodes, uses the same host clock,
and requires no fonts, images, additional dependency or QML decoration layer.
Reduced motion keeps the held cues; Canvas fallback uses those exact paths.
