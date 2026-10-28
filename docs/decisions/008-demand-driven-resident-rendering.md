# ADR-008: Demand-driven rendering for resident operation

## Status
Accepted, 2026-10-27. Retains ADR-006's shared animation clock and ADR-007's
vector accessories. Updates the native bridge's scheduling and resource
lifetime without changing expression geometry or output resolution.

## Context
Eyes should remain available throughout a desktop session with little idle
overhead. The hidden host woke every 140 ms to check a fallback that could
never supply useful Wayland coordinates. KWin movement also scheduled a
32 ms timer and broadcast attention while no eyes were visible.

The native Rive bridge independently requested its next item update, polled
inputs on every Qt synchronization and redrew its offscreen targets. The
wallpaper's FrameAnimation also updated the shared model at screen refresh
rate. The upstream offscreen submission preceded synchronization and path
preparation, relying on continual extra frames to display the final pose.

## Decision
Keep the windowless host and its existing hidden autostart. Enable XCB cursor
polling only while visible and before the first KWin position. Stop it
permanently once KWin supplies a valid position. While hidden, retain each
latest position directly without timers or attention messages. Coalesce
visible movements as before and discard duplicate positions. Visibility
changes still send attention, so waking immediately restores the last target.

Use a FrameAnimation-based clock with a default maximum of 30 model updates
per second, configurable from 20 to 60 through `AnimationFps`. Keep a normal
update within the shared integrator's 64 ms limit. Accumulate real
frame time and fractional periods rather than advancing by a fixed timestep;
reset the accumulator when stopped so hidden time is not replayed. This
reduces expensive vector work on high refresh displays while preserving the
existing spring integrator and motion timing. The browser debug renderer's
clock is unchanged.

Remove the native self-scheduling loop and reverse input polling. Explicit
model updates dirty the item, and state-machine attachment initializes its
held inputs without waiting for another animation tick. Submit vector passes
in QSGRenderNode::prepare on the current command buffer, after preparing this
frame's paths and before SMAA and final composition. This follows Qt's
[render-node lifecycle](https://doc.qt.io/qt-6/qsgrendernode.html#prepare).
Cache vector drawing and SMAA until the synchronized model or geometry changes;
still update composition uniforms for opacity, screen projection and transforms.
Retain native output dimensions, pixel density and all existing antialiasing.

Load the wallpaper's Rive scene only while its reveal is nonzero. Complete the
existing fade before unloading; preserve the shared simulation and original
wallpaper. The next show loads a renderer with the current held inputs. The
host socket, D-Bus endpoint and completion timer remain available throughout.

Keep downloaded LGPL sources unmodified. Mirror the bridge in the ignored
build directory and guard all adaptations against missing or ambiguous
upstream text. Both antialiasing and scheduling operate on the same adapter.

## Validation
Retain all Node/WASM checks and native GPU pixel tests for eight expressions,
subpixel edges, smile thickness, accessories, blinking and fading. Add real
Qt tests for clock rate, elapsed time, stop/resume, held native poses during
unrelated animation and hidden resume. Extend the isolated D-Bus host test to
check silent hidden movement, restoration of the latest position, duplicate
suppression and the 4.5-second completion timer despite status reads.

Measure the installed Plasma wallpaper as well as the host: sample process
CPU-time deltas, resident memory and main-thread context switches over equal
stationary hidden/show intervals. CPU percentages use one logical core as
100%; Plasma measurements include its other plugins. Temporarily enable
`DebugPerformance` to check actual model cadence, then disable it and restore
hidden idle. Standalone rendering tests establish correctness, not the cost
of the user's actual desktop.

Verified locally on 2026-10-27 with stationary 10-second samples (one logical
core = 100%):

| Measurement | Before | After |
| --- | --- | --- |
| Hidden host CPU | 0.2% | 0.0–0.1% |
| Hidden host main-thread context switches/second | 7.2 | 0.0–0.1 |
| Visible Plasma CPU, including its other plugins | 8.2% | 4.0% |
| Hidden Plasma CPU | 0.1% | 0.1–0.2% |

All 50 Node/WASM/service checks, 89 Qt/GPU checks and the isolated native-host
cursor/completion integration test passed, as did script syntax checks and
the desktop build. The installed completion state remained visible at two
seconds and hid by 5.6 seconds despite an intervening status read.

The installed wallpaper reported 30.0–30.3 model fps at DPR=2. Host RSS was
77.1 MiB after installation, including shared Qt libraries; idle CPU savings
do not imply eliminating that baseline memory. Plasma RSS changed across a
shell restart and is not attributed to the optimization. These are short
local observations rather than a hardware-independent resource guarantee.

The separate XCB high-DPI test timed out after 50 seconds before producing
test output, consistent with the prior session limitation recorded in
ADR-007; it is not counted as passing. Actual DPR=2 loading is confirmed in
Plasma logs but does not replace the high-DPI pixel regression. Temporary
performance logging was disabled and hidden idle restored after sampling.

## Consequences
Resident mode trades the previous screen-rate animation for a default 30 fps;
users can select 60 fps. First show reloads native resources and can take
longer than reusing an always-loaded scene. Shared pose and light semantics
are unchanged, so the existing Rive asset remains valid. Hidden mode still
receives KWin movement events to preserve global coordinates, but does no
animation, fallback polling or attention broadcasting. The process remains
resident with Qt's baseline memory footprint.
