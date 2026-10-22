# ADR-001: Render desktop eyes in the Plasma wallpaper scene graph

## Status
Accepted, 2026-10-22.

## Context
MIO must affect only the wallpaper. Desktop icons, panels and application windows must stay above it, with normal input handling. A Layer Shell background surface can cover Plasma's desktop icons because it is a separate surface in the same layer.

The initial wallpaper plugin drew an entire screen-sized QML Canvas every 16 ms. Qt 6 Canvas.Image rasterizes on the CPU and uploads its image to the GPU; scaled Canvas shadows made this especially expensive. A 1600 by 1000 thinking-expression probe measured approximately 2.7–3.3 updates per second, with typical intervals of 300–375 ms.

## Decision
Use a native Plasma wallpaper plugin. Keep the host windowless: it handles the Unix socket, global pointer, tray and a loopback WebSocket state bridge.

Share pose, springs, blink timing, attention, eye dimensions and light geometry through `eyes-core.js`. Keep the browser's Canvas renderer. On Plasma, draw each eye using a precompiled Qt Quick fragment shader: a curved rectangular band, soft coverage at every edge and corner, a broad surface light, two quiet secondary reflections and analytical glow. Only decorative marks use a small 560 by 340 Canvas. Drive the simulation with `FrameAnimation` rather than a fixed 16 ms Timer.

Cache the static frosted wallpaper using `ShaderEffectSource` with `live: false`; refresh it when the image loads or dimensions change. On bridge disconnect, hide the material and eyes to restore the clear wallpaper.

Generate `.qsb` during CMake builds using Qt 6 ShaderTools and install it next to `EyeScene.qml`. Do not commit compiled shader artifacts.

## Validation
A sustained standalone GPU probe measured 59.3 updates per second with a 17 ms p95 interval on a 60 Hz display. This probe is not a substitute for desktop measurements.

Plasma kept its previous QML component cached after a plugin switch, so replacing files alone left the old slow renderer active. After refreshing `plasma-plasmashell.service`, the actual wallpaper logged `MIO GPU wallpaper loaded`. Consecutive five-second samples measured about 59–60 updates per second with 17–18 ms p95 intervals, with some busy intervals around 55–59 updates per second. These are simulation frame cadence measurements, not a guarantee about every compositor presentation or every machine.

The installer detects changed renderer resources and refreshes the Plasma service when available. Optional wallpaper configuration `DebugPerformance=true` logs actual `MIO_PERF GPU` samples. Disable it after measuring. Use Qt 6 tools from `/usr/lib/qt6/bin`; unqualified tools may resolve to Qt 5.

## Alternatives
- Full-screen Canvas: rejected because CPU rasterization, shadows and image uploads dominate every frame.
- Lower-resolution eye textures: could reduce uploads, but would soften the main eye edges as screens grow.
- Separate desktop window: rejected because it cannot reliably sit between Plasma wallpaper and desktop icons.

## Consequences
The runtime needs GPU-backed Qt Quick and the build needs Qt 6 ShaderTools. Both renderers now use square-cornered bands with soft coverage instead of explicit rounded corners; pose, dimensions, bend, secondary light flow and light semantics stay shared. Actual pixel regression tests cover all eight expressions and attention/blink behavior. The application must not fall back to silently drawing a full-screen CPU Canvas.

References: [Qt Canvas performance guidance](https://doc.qt.io/qt-6/qml-qtquick-canvas.html), [FrameAnimation](https://doc.qt.io/qt-6/qml-qtquick-frameanimation.html), [ShaderEffect](https://doc.qt.io/qt-6/qml-qtquick-shadereffect.html).
