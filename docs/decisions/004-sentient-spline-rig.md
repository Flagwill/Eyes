# ADR-004: Integrate the Sentient Eye Engine spline deformation kernel

## Status
Accepted, 2026-10-24. Supersedes ADR-003's quadratic eye boundary and tangent-only
light projection. Retains its restrained material, ADR-002's sharp contours,
and ADR-001's native wallpaper layer.

## Context
The owner found the expression differences too weak and the highlight shapes
unconvincing, and authorized replacing the underlying engine. Merely changing
rectangle dimensions or one quadratic bend cannot control the outer corner,
inner corner, and lid shoulder independently.

## Decision
Port the MIT-licensed five-point Catmull–Rom rig from
[Sentient Eye Engine](https://github.com/Sentient-LabsDev/Sentient-Eye-Engine/tree/42761191371f328361b62b5cfd095aac3f58c33d).
Pin the upstream source and preserve its license. Integrate the deformation
kernel, not the Python/Pygame application. Extend it to two independently
controlled lids, each with five control points and four cubic segments.

The shared simulation springs all pose and local node parameters. The port
compiles the nodes into coefficients once per eye per frame. Canvas traces the
equivalent cubic Beziers; Plasma evaluates the coefficients in its existing
ShaderEffect. Neither renderer owns expression definitions. Happy eyes use
identical upper/lower control-point offsets and preserve constant thickness,
including during attention and blinking.

Project highlights in normalized surface coordinates: horizontal position on
the lid and vertical fraction between its actual upper/lower curves. The main
field is a smooth elliptical density without a second eye silhouette. Two
low-strength rectangular reflections use the same coordinates. Canvas samples
the field in narrow curved strips; the GPU evaluates it analytically. This
keeps long reflections attached to the entire smile instead of a flat tangent.

Browser imports load the port then the core. CMake bundles the exact two files
for QML; the installer compares the built bundle before deciding whether to
refresh Plasma. No additional native renderer, full-screen window, runtime
network request, or Python dependency is introduced.

## Alternatives considered

- **Grobot_Animations (MIT):** inspected the actual source at
  `858d8da648c9e71ff9b9f5e6f558ba85293a70fb`. Its spring integration is useful,
  but the supplied renderer uses circles/rings with rectangular and triangular
  cuts. Eyes already has time-based springs; this adds little lid flexibility.
- **RoboEyes (GPL-3.0):** strong compact-display reference for timing and gaze,
  but its four base moods and graphics primitives do not provide a richer
  continuous deformation model for this project.
- **Rive:** a real vector animation/state-machine option with MIT runtimes and
  a community LGPL Qt Quick plugin. It would require new authored animation
  assets, plugin/runtime compatibility work and another rendering integration.
  The selected kernel provides the missing shape control within the shared
  runtime and native wallpaper architecture.
- **Inochi2D (BSD-2-Clause):** useful for layered illustrated puppets; introduces
  model rigging, texture assets and native/WebAssembly integration for two
  currently procedural eye surfaces.

## Validation
The JavaScript spline is checked against the pinned upstream Python function.
The browser module and QML bundle must produce identical coefficients. Tests
cover every emotion-to-emotion morph, blink, sharp alpha boundary, reflection
containment, fixed cursor attention, paused clocks, and extreme displays.
`gallery.html` renders all eight states at equal scale using the real engine,
with controls for motion and hiding labels. Visual review complements the
numerical tests; it does not establish human emotion-recognition accuracy.

## Consequences
New expressions may sculpt the shoulder nodes instead of increasing whole-eye
rotation. GPU and Canvas must consume the compiled rig rather than reimplement
poses. Preserve the vendored MIT notice in installed packages. Update this ADR
if the project later adopts fully illustrated eye assets or a general vector
animation editor.
