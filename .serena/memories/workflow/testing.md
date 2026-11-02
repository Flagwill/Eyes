# Validation Matrix

- Baseline for code changes:

```bash
npm test
npm run check
npm run desktop:build
```

- GPU, Rive, shader, QML interaction, or output-quality changes also require:

```bash
npm run desktop:test
```

- Use real installed desktop behavior for wallpaper mount, input passthrough, global cursor, complete fade-out, and z-order acceptance. Offscreen results are not substitutes.
- Cursor bridge changes: stop the real host first, then run `npm run desktop:cursor:test`.
- Wallpaper lifecycle changes: stop the real host first, then run `npm run desktop:wallpaper:test`.
- High-DPI changes: run `npm run desktop:hidpi:test`; the isolated X11/XWayland path is the authoritative Qt 6.12 check.
- Geometry clipping changes: run `cmake --build build --target eyes-geometry-test && build/eyes-geometry-test`.
- Use Qt 6 tools under `/usr/lib/qt6/bin` or set `QT6_BIN_DIR`; system `qmllint` and `qmltestrunner` may target Qt 5.
- Only claim validation passed for commands actually run in the current workspace.
