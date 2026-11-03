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
- Activity (agent state, accent, prop) changes: stop the real host first, then run `npm run desktop:activity:test`.
- High-DPI changes: run `npm run desktop:hidpi:test`; the isolated X11/XWayland path is the authoritative Qt 6.12 check.
- Geometry clipping changes: run `cmake --build build --target eyes-geometry-test && build/eyes-geometry-test`.
- Use Qt 6 tools under `/usr/lib/qt6/bin` or set `QT6_BIN_DIR`; system `qmllint` and `qmltestrunner` may target Qt 5.
- Only claim validation passed for commands actually run in the current workspace.
- Run virtual KWin sessions (GPU tests, benchmarks, captures) with their own `XDG_CONFIG_HOME` (e.g. a temp dir). KWin persists the `Virtual-0` output scale/mode into `~/.config/kwinoutputconfig.json` and reuses it in later virtual sessions, silently changing DPR. Fractional-scale checks need `kscreen-doctor output.Virtual-0.scale.1.4` inside the session; `--scale` alone is not applied.
- Pillow's `getbbox()` on RGBA images looks at alpha only; compare captured frames as RGB (or per channel) or differences are missed.
- Host load changes frame rate in benchmarks; compare CPU as ms per frame with interleaved before/after runs.
