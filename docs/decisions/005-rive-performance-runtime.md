# ADR-005: Use Rive for authored eye performance and vector playback

## Status
Accepted, 2026-10-24. Supersedes ADR-004's choice of the procedural renderer as
the product renderer. Retains its shared spline geometry, ADR-002's sharp
abstract eyes and ADR-001's input-transparent Plasma wallpaper architecture.
The eyelid interpolation and timeline strategy below are updated by
[ADR-006](006-continuous-lids-and-shared-performance-clock.md).

## Context
The owner found the spline-only integration insufficiently expressive and
explicitly authorized replacing the underlying architecture. A more capable
curve function does not provide a complete character performance system.
Both Web and Plasma need the same poses, continuous interrupted transitions,
authored eyelid acting, independent blinking and cursor attention.

## Decision
Use the actual [Rive open-source runtime](https://github.com/rive-app/rive-runtime)
and state machine, with one shared `assets/eyes/eyes.riv` file. The browser uses
the MIT Canvas advanced WASM runtime 2.47.0. Plasma uses the LGPL Qt Quick RHI
bridge and its supported native runtime pin; exact revisions and checksums are
in `cmake/Rive.cmake` and `vendor/rive/README.md`.

Compile the shared spline poses and acting scores into Rive paths and timelines
using `tools/build-rive.mjs`. Each emotion has a still timeline, a looping
performance and a separate entry pose. Eye shapes use exact cubic handles; motion channels use
bounded cubic Hermite interpolation. Host springs control expression weights;
convert barycentric weights into successive direct-blend factors to match
Rive's ordered interpolation semantics. This also supports switching again
before a transition ends. Entry weights have their own springs and decay on
interruption; repeated state commands do not restart them. The earlier adapter
applied entry accents only to the reference pose, so the product renderer
missed eyelid anticipation and settling. Test actual Rive geometry and native
pixels to prevent that gap. Blink, horizontal/vertical attention and slower light
attention occupy independent state-machine layers.

Retain `getLayout` and the host's existing gaze, blink scheduling and lifecycle
commands. Light fields use broad gradients, actual lid geometry as clips, and
surface-projected centres. Unit eye coordinates allow materials and eyelids to
deform together. Two faint reflections move in the same direction. Turning off
natural motion blends to the still timelines; internal Rive animation phases
are independent of the host clock.

Give each emotion a separate sequence of held beats and a delayed partner
eyelid. Closing changes the upper lid more than the lower one; avoid uniform
block scaling as the main performance. Use quintic easing with zero endpoint
acceleration, sampled at 12Hz for authoring and played through continuous cubic
interpolation. Keep long quiet holds and resting loop boundaries. Happy retains
parallel lids throughout its larger smile and entry lift; focus stays restrained.
Limit combined cursor and acting rotation before the pose springs, rather than
letting a stronger performance tilt the whole rig beyond its bounds.

The browser keeps the procedural renderer as a reported fallback. The old
Plasma `EyeScene.qml` remains a geometric test reference; the product uses
`RiveEyeScene.qml` and a separately installed, replaceable native plugin. GPU
render targets follow actual output dimensions. No background window, browser
engine embedded in Plasma, runtime CDN, input receiver or account is added.

Enable the bridge's SMAA explicitly: high tessellation quality alone leaves
binary edge coverage when Plasma supplies a single-sample target. Verify both
intermediate edge pixels and a narrow transition in normal and high-DPI tests.
This changes coverage at the contour without adding a silhouette blur.

SMAA alone left visible steps along shallow curves. The native adapter now
allocates independent multisample colour and stencil targets, choosing 8, 4
or 2 samples when supported; Metal/unsupported hardware keeps single sampling
and SMAA. Clip, draw and blend pipelines match the offscreen sample count,
while the final pipeline matches Qt's actual target. This avoids imposing
multisampling on the whole Plasma shell. Increase normalized path precision
from 512 to 4096 units, reconstruct the final texture linearly during
fractional movement, and blend its premultiplied colour once. The previous
final pass multiplied alpha again, producing dark partial-coverage pixels.
The guarded source adaptations live in `cmake/RiveAntialiasing.cmake` and keep
upstream notices without modifying downloaded sources.

## Compatibility evidence and adaptations

The upstream bridge targets older Qt/Rive features, so its README alone was
insufficient evidence. A locally compiled vector asset was first loaded,
rendered and numerically blended through the real bridge on Qt 6.12. The full
asset is exercised by both the WASM and native GPU regression suites.

Integration details needed explicit treatment:

- Lowercase inputs avoid a bridge bug that lowercases QML names before
  connecting notifications.
- Register the upstream settings gadget's enum metadata as a QML namespace.
- Normalize tiny local paths before Qt triangulation, then restore coordinates.
  Otherwise normalized lid curves are quantized/flattened before parent scaling
  and fail actual pixel-boundary tests. The replacement tail retains LGPL
  notices and leaves the downloaded upstream source untouched.

The asset intentionally uses paths, gradients, clips, numeric inputs and
timelines understood by both runtimes. It does not require newer view-model
binding, Luau or custom shader scripting. The official CLI 1.7.0 is a separate
authoring tool, not an open-source runtime; it performs only local verify/build
operations. Normal builds use the committed asset without that tool or a Rive
account. Asset/source hashes prevent stale generated content.

## Alternatives considered

- **Keep Sentient only:** useful geometric foundation, but the previous result
  did not satisfy the owner's visual feedback. Retained as the geometry source
  and reference, not presented as a complete performance-engine replacement.
- **ThorVG / Lottie:** capable vector playback; would still require authored
  eye performance and an interaction/mixing arrangement. Rive offers a matching
  state-machine asset that was demonstrated through both hosts.
- **Inochi2D:** attractive for illustrated layered puppets; a different asset
  workflow and runtime integration for the existing abstract vector design.
- **Godot:** a viable open-source animation environment, but embedding a second
  application/rendering framework inside a wallpaper item is a larger change
  than the demonstrated Qt Quick plugin. This is a project-fit judgment, not
  a general ranking of renderer quality.
- **New small robot-eye repositories:** recent creation or additional emotion
  names alone do not establish better motion, maintenance or Qt integration.

## Validation

`npm test` runs the actual WASM runtime across all 64 interrupted expression
transitions, checks shared poses, blink/attention/motion controls, source hashes,
positive lid openings and local binary asset serving. Qt tests render both
paths, check all eight Rive expressions against the shared spline, clear alpha
boundaries, equal-thickness smiles, real blink pixels and output dimensions.
Browser review must verify `data-renderer=rive`, not assume the fallback image
proves Rive works. Desktop verification requires the Rive-loaded Plasma log,
global cursor response and completion auto-hide, together with frame timing.

Verified 2026-10-25 on Qt 6.12: 46 Node/WASM/service checks, 70 GPU checks and
39 additional X11/XWayland checks with doubled pixel density passed. These now
include all eight actual Rive entry poses, interrupted entry decay, quiet loop
boundaries and native pixels showing joy's lift and settling. Coverage
checks now exercise every expression at three fractional pixel positions,
require intermediate coverage in more than 60% of sampled columns, and keep
transitions within two physical pixels. A separate actual-pixel check verifies
that opacity fades blend correctly.

The earlier antialiasing investigation's SMAA-only happy-lid check admitted 298/572 columns with intermediate
coverage; it missed the reported shallow-curve and fractional-motion cases.
The expanded regression failed against that installed build. That revision's happy
curve reached coverage in 572/572 columns; idle improved from 171/552 to
550/552, without a wider transition. These are controlled static captures,
not emotion-recognition measurements.

The updated performance asset was installed and the real Plasma wallpaper loaded
at `dpr=2`. After settling, its temporary performance log reported approximately
59.8–60.0 fps and 17.2–17.5 ms p95 frame intervals. These are local-session timer measurements,
not a benchmark guarantee for other hardware.

Completion was checked with the new asset: happy remained visible at two
seconds, then hid after the existing completion interval despite status reads.
Temporary performance logging was disabled and the host returned to hidden idle.

## Consequences

First native builds download about 28MB of checksum-pinned source and compile
an additional plugin. Browser previews require `npm ci`. Updating Qt private
headers requires rebuilding the native plugin. The native runtime pin is older
than the browser's; do not introduce untested modern Rive features into assets.
Any pose or acting-source edit must regenerate the asset and manifest.

Rive's material uses surface-centre projection and clipping; it is not claimed
to be pixel-identical to the reference renderer's analytic curved field. New
engine capabilities do not prove emotion-recognition accuracy or make the
abstract eyes photorealistic. Performance and visual improvements must be
verified in the actual wallpaper and browser, not inferred from the engine name.
