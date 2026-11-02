# Shared Rendering Pipeline

- Shared geometry, expression springs, face perspective, accents, lights, and blink logic live in `eyes-core.js`.
- Browser Canvas remains the fallback and parity reference. `rive-renderer.js` plus `assets/eyes/eyes.riv` is the default vector runtime in browser and desktop.
- `tools/build-rive.mjs` authors Rive from shared poses/actions. After shared-core or generator changes, regenerate with `EYES_RIVE_CLI=/path/to/rive npm run eyes:author` and commit the `.riv` plus manifest together.
- Desktop product path is `RiveEyeScene.qml` through the native Qt Quick RHI plugin. `EyeScene.qml` and `eye.frag` are the GPU geometry reference, not alternate expression implementations.
- `desktop/main.cpp` is a windowless Qt host: Unix socket, WebSocket, D-Bus, tray, and per-screen cursor mapping. The visible desktop surface belongs to the Plasma wallpaper plugin.
- Plasma wallpaper mount is temporary and reversible. Preserve original containment state, update both config and the running containment, and restore on hide, complete fade, crash recovery, and quit.
- Rive scheduling is demand-driven from the shared model clock. Do not restore native self-refresh or per-frame reverse input polling.
- Keep generated `build/` output, QSB files, caches, and runtime logs out of version control.
- Vector target ratio comes from `Window.window.devicePixelRatio` (Qt 6.11+, fallback `Screen.devicePixelRatio`). Wayland rounds the screen ratio (2 at KDE scale 1.4) while the window renders at 1.4; sizing from the screen ratio doubled the MSAA target area (ADR-016).
- `cmake/RiveRuntime.cmake` patches a build-dir copy of the runtime's `blend_state_instance.hpp` (no keyed-callback scan for blend animations). Valid only while the asset has no Rive events; `tests/rive.test.mjs` guards it. Never edit the downloaded runtime sources.
- Clip triangulation is cached in the renderer by clip stack (`cmake/rive-clip-cache.cpp`); keep comparing by value so changed content cannot hit.
- Simulation hot paths: `RIVE_VARIANT_KEYS` precomputes the 140 input names; `Spring.step` returns early at rest (1e-9). Rive source (`scene.rml`) is unaffected; only `manifest.json` `sourceHash` follows `eyes-core.js` text when no Rive CLI is available (verify scene.rml is byte-identical first).
- Eyes must stay visible through the user's blurred/translucent windows: never gate rendering on window occlusion. KWin does not throttle frame callbacks for occluded windows.
- Native MSAA is capped by CMake `EYES_RIVE_MAX_MSAA` (default 4; 8 only as a quality reference). Automatic AA still skips SMAA at >=4 samples and adds it below 4 (ADR-017).
