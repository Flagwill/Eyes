# Eyes Product Invariants

- Public product name is `Eyes`; old names exist only in migration cleanup and regression tests.
- Desktop layer is a Plasma wallpaper plugin. It must remain below desktop icons, panels, taskbars, and normal windows, and must never capture input.
- Wallpaper content is limited to frosted background, eyes, and shared expression accents. No title, status text, product name, or HUD overlay.
- Browser preview and desktop use the same `eyes-core.js` model and `getLayout`; do not fork expression or geometry constants in a host.
- Eyes are the full-screen focal point, scale with the display, use unrounded rectangular/bent-band silhouettes, and retain crisp edges without blur, feathering, halos, or rounded corners.
- Animation transitions use continuous springs. Do not replace them with discrete expression frames.
- `happy` is a long rectangular eye with matching top/bottom curvature and equal thickness.
- User hide and user quit intent outlive agent activity through persisted state. Never auto-start a missing host from hooks or command clients.
- `complete` stays happy for about 4.5 seconds, then fades; read-only commands must not cancel that timer.
- KWin global cursor drives the installed desktop version; WebUI attention is page-local only.
- Secrets, user data, machine paths, and generated credentials never enter source or memory.
