# ADR-003: Express emotion through eyelids and keep surface light diffuse

## Status
Accepted, 2026-10-23. Its quadratic boundary and tangent-only projection are superseded by [ADR-004](004-sentient-spline-rig.md); the remaining expression and material principles still apply. Refines the internal geometry and material while retaining ADR-002's sharp contours and ADR-001's wallpaper architecture.

## Context
Increasing the size difference, rotation and curvature of whole rectangular eyes made the shapes harder to read. A relatively strong, bounded internal rectangle looked like a separate patch. The owner requested another pass on every expression, its shape and its highlights.

## Decision
Keep a common rectangular eye surface with continuous upper and lower eyelid slopes, represented by `lu/ld/ru/rd` in the shared pose. Interpolate those parameters with the existing springs. Use restrained whole-eye rotation and similar widths; distinguish emotions through opening, upper-lid angle, curvature and gaze. Happy eyes remain parallel, constant-thickness curved bands.

Project each reflection onto the same surface, including the change in local thickness across a sloped eye. `getLightGeometry` supplies tangent and taper to both Canvas and the GPU shader. Main light is a broad, low-contrast purple wash, with soft edges and a gradual vertical falloff. Keep the two slow secondary reflections below approximately three percent strength.

Disable decorative emotion glyphs by default. Render browser emotion thumbnails with the shared engine instead of independent CSS approximations. Keep all host commands, cursor scopes, completion timing and wallpaper layering unchanged.

## Validation
Model tests check non-crossing eyelids, reflection containment, distinct eyelid cues and transitions at multiple frame rates and extreme gaze directions. GPU pixel tests sample both sides of upper and lower eyelids across each of the eight expressions. Review the eight expressions together without decorative symbols, then inspect motion and attention. These checks establish geometry and rendering behavior; they do not establish how reliably people recognize each emotion.

## Consequences
Canvas paths, GPU boundaries and light projection must evolve together. New expressions should use the shared eyelid parameters and the motion script rather than adding host-level shape overrides, larger rotations or symbolic labels. Internal light should remain subordinate to the silhouette.
