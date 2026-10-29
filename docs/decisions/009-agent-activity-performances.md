# ADR-009: Agent activity performances

## Status
Accepted, 2026-10-28, following the request to cover the agent's full working
cycle with expressive eyes and small paper, pen and terminal accessories.

## Context
Eight emotions express mood, but every tool previously became focused work.
Reading, writing, running a command and reaching an MCP server looked alike.
The existing shared spring model and Rive basis poses can carry purposeful
activity performances without introducing another renderer or animation clock.

## Decision
Keep the eight emotions and add a separate activity catalog in `eyes-core.js`.
An activity has a held pose, entry, three complementary gestures, timed gaze
targets and an optional small vector prop. It uses exactly the same springs,
layout, pointer priority, reduced-motion behavior and Rive authoring pipeline.
Props remain outside the blink nodes and below the eyes' visual prominence.

Following visual review, props are participating objects with a shallow vector
relief, not corner badges. Use a filled front face, darker extruded side, folded
corners and restrained bevel gradients. Put paper, terminals and books in the
lower working area; bring the magnifier toward the eye it inspects. Separate
pen, ink, terminal output, connection ends, turning page and save arrow into
vector parts. Key their transforms/visibility with the same three eye gestures
through `propA/propB/propC`; direct the gaze toward the point of operation.

Shared gaze projection rotates the objects and foreshortens their faces as the
view turns. Rive has separate nested yaw/pitch nodes with direct blends that
reset to the baseline every frame. Its 1D blend retains previous transforms at
intermediate weights, so it cannot supply the required stateless perspective.
The Canvas fallback uses the same projection functions and relief paths. No
3D engine, raster stickers, independent random movement or blur is introduced.
Silhouette tests isolate the eyes by disabling accessories; separate real-pixel
tests verify object overlap, visibility and independence from blink squash.

| Activity | Eye performance | Prop |
| --- | --- | --- |
| listening | Open, attentive, gently lift one eye | — |
| planning | Side-up consideration, compare two steps | Three steps |
| reading | Downward gaze, left-to-right scan and return | Page |
| searching | Alternate inspecting left and right | Magnifier |
| creating | Lift, open with anticipation, settle proudly | Page and plus |
| editing | Lower gaze, short writing strokes, recheck | Pencil and page |
| running | Narrow, look right, acknowledge output | Terminal |
| mcp | One eye reaches out, partner follows, reconnect | Linked nodes |
| tool | Small deliberate squeeze and confirmation | Wrench |
| skill | Recognize a pattern, lift partner, apply it | Open handbook |
| testing | Check one side then the other, slight nod | Check box |
| debugging | Uneven squint, inspect, open on a clue | Magnifier and alert |
| reviewing | Compare sides, hold a measured gaze | Page and check |
| saving | Gather inward, nod and release | Tray and down arrow |
| delegating | Look outward, acknowledge, return | Branching nodes |
| waiting | Soft open eyes, patient listening | Pause |
| blocked | Asymmetric worried lids, hold, ask | Alert |
| retrying | Regather, look back, open with resolve | Return arrow |
| summarizing | Scan once, gather toward center | Page with three lines |
| complete | Equal-thickness smile, lift and settle | Existing stars |

Expose `eyes activity ID`, `EyeSimulation.setActivity(ID)` and
`window.eyes.setActivity(ID)`. Invalid ids must leave the current performance
and completion timer intact. Existing lifecycle commands remain available;
`complete` and `activity complete` both show happiness for 4.5 seconds and hide.
Generate native activity metadata into the Rive manifest; embed that manifest
as a Qt resource instead of maintaining a second list of states in C++.

Classify hook calls from the tool name and structured input only. Never execute,
persist or echo command arguments, code, paths, tool responses or skill text.
Keep `{id, activity}` for each active call, choose the most recently started
remaining call, and return to thinking after the last call. Unknown tools use
the generic tool performance. Skill names or a command's intent hidden inside
opaque wrappers cannot be inferred reliably; harnesses can send an explicit
activity. Codex 0.149 exposes compaction, subagent and interrupt hooks, so map
those events and track active subagents independently from tool calls.

Use only structured response fields for failure detection. Show debugging after
the first failed call, retrying when the next call has the same classified
activity, and blocked after two consecutive failures without an intervening
success. An interrupt is a pause and maps to waiting rather than implying that
the work is blocked. A Stop event is not proof of success or failure, but it
remains the project's completion signal and must preserve the host-owned 4.5
second fade timer. Do not read or persist transcript text, commands, paths,
code, skill bodies or tool outputs.

## Implementation and validation
1. Add shared catalog, poses, gestures, gaze and font-free props; regenerate Rive.
2. Connect native commands, QML inputs, browser controls, gallery and cycle demo.
3. Extend the hook classifier and concurrent-call state, including compaction,
   subagents, interrupts, failures and retries, with compatibility for existing
   state files. Document automatic coverage and explicit reporting.
4. Verify all activities' positive lid opening, continuous interruptions, static
   reduced motion, prop parity and real WASM/native GPU output. Run `npm test`,
   `npm run check`, `npm run desktop:build`, `npm run desktop:test`; install and
   check the actual Plasma load and completion timer where the session permits.

## Consequences
The asset, shared core, QML bindings and native manifest upgrade together.
There are no new dependencies or fonts. Activity differences convey intent;
they do not guarantee that viewers can identify every action without labels.

## Visual artifact
`docs/gallery/agent-activities-relief.png` contains six actual native Rive
renders after the interaction/relief revision, with a neutral generated
background. It records appearance, not animation timing or desktop layering.

## Verification record
On 2026-10-29, all 68 Node/WASM/hook checks, syntax checks and the desktop build
passed. The final offscreen GPU suite passed 246/246. The native host test
exercised every activity, unknown input,
completion timing and interruption of the cycle demo. The real XWayland DPR=2
suite passed 148/148. Pixel coverage is measured against the adjacent opaque
surface over a 10–90% coverage interval, retaining the two-pixel transition and
independent silhouette/fade checks; a fixed green cutoff missed valid MSAA
coverage on the dark saving lids.

The installed Plasma component logged both GPU and Rive loading on eDP-1 at
DPR=2. A real installed-host completion remained happy and visible after two
seconds and was hidden after 5.3 seconds despite status reads. The user-level
Eyes autostart remains the only Eyes autostart entry. These checks confirm
rendering and lifecycle behavior; visual recognition remains a human judgment.

On 2026-10-29, a persistent wallpaper guard was added to `eyes-desktop`.
Plasma theme tools and wallpaper settings may replace `org.eyes.wallpaper`
with `org.kde.image` or another wallpaper plugin. The guard watches the desktop
containment configuration, debounces writes, copies the new image, color and
fill mode into Eyes, and restores the Eyes plugin in both persistent config and
the live containment. `kwriteconfig6 --notify` alone is insufficient because
an already-running Plasma containment can retain its old plugin while disk
configuration says Eyes. The guard therefore also calls PlasmaShell's
`evaluateScript`. It is idempotent and leaves panels and the animation frame
limit untouched. Package wallpapers are resolved to a concrete bundled image;
slide paths and solid colors remain usable. The host also retries its socket
and bridge after a transient startup race, and the user service restarts it
after an abnormal exit. The QML bridge activates only after its URL is ready and
requests a fresh snapshot when the socket reaches `Open`, covering both initial
state delivery races and session-manager restarts.
