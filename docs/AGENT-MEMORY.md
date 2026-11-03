# Agent Memory

Eyes uses Serena and Beads as complementary project-memory layers for Codex.

## Ownership

| Layer | Owns | Does not own |
| --- | --- | --- |
| `AGENTS.md` | Mandatory repository rules, safety boundaries, and short entry points | Task status or long architecture notes |
| Serena | Symbol-aware code navigation, stable architecture maps, invariants, and debugging paths | Work-item lifecycle or acceptance status |
| Beads | Issues, acceptance criteria, dependencies, progress, handoffs, and operational memories | Source-code structure or accepted ADRs |
| `docs/decisions/` | Accepted architecture decisions and their rationale | Temporary implementation notes |

Do not duplicate the same fact across all layers. Link to the authoritative layer and
keep the index short.

## Codex Wiring

Project MCP configuration lives in `.codex/config.toml`:

```toml
[mcp_servers.serena]
command = "serena"
args = ["start-mcp-server", "--project-from-cwd", "--context=codex"]
startup_timeout_sec = 15
tool_timeout_sec = 240
```

Codex loads this project layer only for a trusted project. Restart Codex or open a new
session after changing it. Confirm the connection with `/mcp` in the Codex client or:

```bash
codex mcp list --json
```

Do not add `.codex/hooks.json`. The user-level Codex hooks already drive Eyes lifecycle
states; a project-level copy would invoke the same lifecycle twice. Beads context is
loaded explicitly with `bd prime`, and Serena activation is requested through its MCP
tools.

## Session Start

1. Read `AGENTS.md`.
2. Run `bd prime` to load current work, dependencies, handoff state, and Beads memories.
3. Activate the current directory in Serena and read `mem:core`.
4. Read only the Serena memories referenced by `mem:core` that match the task.
5. Check `bd ready --json` before creating duplicate work.

## Work Cycle

Use Beads for non-trivial work:

```bash
bd ready --json
bd create "Concise outcome" -t task -p 2
bd update <id> --claim
bd show <id>
bd close <id>
```

Use Serena for semantic discovery and edits. Prefer symbol operations over repeated
full-file reads or fragile text replacement. Before finishing:

- Run the validation required by `AGENTS.md`.
- Record changed scope, validation results, and remaining risk in the Bead.
- Close the Bead only when its acceptance criteria are met.
- Add a Beads memory only for a stable operational lesson:

```bash
bd remember "Durable operational insight" --key short-stable-key
```

- Add or update Serena memory only for stable architecture, code-map, invariant, or
  debugging knowledge. Keep `mem:core` as the small entry point and use relative
  topics such as `architecture/*` and `workflow/*`.

## Current Memory Map

- `mem:core`: top-level index.
- `mem:project/invariants`: product constraints that are cheapest to preserve by design.
- `mem:architecture/render-pipeline`: shared engine and host boundaries.
- `mem:workflow/testing`: validation matrix and environment caveats.
- `mem:workflow/memory-management`: Serena/Beads responsibilities and maintenance.

## Installed Tooling

This machine was connected with:

```bash
uv tool install -p 3.13 serena-agent==2.1.0
npm install -g --allow-scripts=@beads/bd @beads/bd@1.3.2
bd init --quiet --skip-agents --non-interactive --prefix eyes
serena project create . --name Eyes \
  --language typescript --language cpp --language qml --language python
serena memories initialize .
```

npm 12 skips package install scripts unless they are allowed. `@beads/bd` downloads its
native binary in postinstall, so without `--allow-scripts=@beads/bd` the `bd` shim is
installed but fails with `bd binary not found`.

The versions are intentionally explicit so upgrades are deliberate. `bd init` also
creates an initial Git commit in some versions; do not rerun initialization as part of
normal setup or maintenance.

## Verification

```bash
bd version
bd prime
bd ready --json
bd doctor --check=conventions
bd doctor --check=pollution
serena memories list .
serena memories check .
codex mcp list --json
```

Serena language servers are enabled for TypeScript/JavaScript, C++, QML, and Python.
Add another language server only when symbolic operations are actually needed for that
language; each server adds startup and memory cost.

## Migration Recovery

Git versions the memory layer, not its runtime state. After moving the repository to
another machine:

- `bd` and `serena` are per-machine tools. Install the pinned versions above.
- The Beads Dolt database (`.beads/dolt/`, `.beads/embeddeddolt/`) is git-ignored and is
  not carried by `git clone`. On a new machine run `bd bootstrap` (dry-run first): it
  clones the data from `sync.remote` in `.beads/config.yaml`, so the old machine must have
  run `bd dolt push`. `bd init` creates an empty database instead.
- Serena needs no manual project creation. `.serena/project.yml` is tracked, and
  `serena start-mcp-server --project-from-cwd` registers it on first start.
  `serena project create` refuses an existing `project.yml`, and
  `serena memories initialize` is unnecessary because `memory_maintenance` is tracked.
- Codex loads `.codex/config.toml` only for a trusted project. Until the project is
  trusted, `codex mcp list --json` does not show `serena`.
- After any `bd init`, check `git status`: `.beads/config.yaml` and `.beads/metadata.json`
  are tracked and must not change silently.
