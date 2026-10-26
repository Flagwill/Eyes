# Sentient Eye Engine integration

Source: [Sentient-LabsDev/Sentient-Eye-Engine](https://github.com/Sentient-LabsDev/Sentient-Eye-Engine).
Pinned revision: `42761191371f328361b62b5cfd095aac3f58c33d`.
License: MIT, Copyright (c) 2025 SentientLabs; see [LICENSE](LICENSE).

`upstream/face_renderer.py` is the source snapshot, with normalized line endings.
It is kept for attribution and the Python/JavaScript equivalence regression.
It is never imported at runtime and does not add a Pygame dependency to Eyes.

`rig.js` retains a direct port of `catmull_rom_spline` and its coefficient
compiler for upstream parity. The product uses the Eyes extension
`compileSmooth`: five-point clamped cubic interpolation with continuous first
and second derivatives. Endpoint tangents come from the shared lid's bend and
slope. Replicating the original endpoint nodes gave a convex smile reversed
curvature near its shoulders; the clamped solver removes that artifact.

Upper and lower lids remain independent and compile into four cubics with a
uniform horizontal coordinate. Canvas Beziers, the GPU reference and authored
Rive handles use the same coefficients. The upstream snapshot and its parity
test stay unchanged; continuity and smile-convexity tests cover the extension.

The original engine's glow, random per-vertex shaking, ellipse body, Pygame
display, input capture, and frame-dependent interpolation are not ported.
Eyes supplies its sharp rectangular band, time-based springs, attention,
pausable motion clock, and curved surface lighting. This integrates the spline
deformation kernel, rather than embedding the entire Python application.

Browsers load `rig.js` before `eyes-core.js` through `eyes.js`. CMake concatenates
the same source files into `build/wallpaper-ui/eyes-core.js` for QML; installation
ships that bundle and the MIT license. No network fetch or code generator runs
at startup. Keep the upstream snapshot, revision, license, and parity test in
sync when updating the port.
