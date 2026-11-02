# Shared Rendering Pipeline

- Shared geometry, expression springs, face perspective, accents, lights, and blink logic live in `eyes-core.js`.
- Browser Canvas remains the fallback and parity reference. `rive-renderer.js` plus `assets/eyes/eyes.riv` is the default vector runtime in browser and desktop.
- `tools/build-rive.mjs` authors Rive from shared poses/actions. After shared-core or generator changes, regenerate with `EYES_RIVE_CLI=/path/to/rive npm run eyes:author` and commit the `.riv` plus manifest together.
- Desktop product path is `RiveEyeScene.qml` through the native Qt Quick RHI plugin. `EyeScene.qml` and `eye.frag` are the GPU geometry reference, not alternate expression implementations.
- `desktop/main.cpp` is a windowless Qt host: Unix socket, WebSocket, D-Bus, tray, and per-screen cursor mapping. The visible desktop surface belongs to the Plasma wallpaper plugin.
- Plasma wallpaper mount is temporary and reversible. Preserve original containment state, update both config and the running containment, and restore on hide, complete fade, crash recovery, and quit.
- Rive scheduling is demand-driven from the shared model clock. Do not restore native self-refresh or per-frame reverse input polling.
- Keep generated `build/` output, QSB files, caches, and runtime logs out of version control.
