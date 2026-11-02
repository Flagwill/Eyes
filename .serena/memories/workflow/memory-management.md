# Agent Memory Management

- `AGENTS.md` is the mandatory rule layer. Serena provides semantic code operations and stable project knowledge. Beads provides work state, dependencies, acceptance, and session handoff.
- Start each Codex session with `bd prime`, then activate the current directory in Serena and read `mem:core`.
- Prefer Serena symbol operations for code discovery and edits. Keep `mem:core` small and link to topic-specific memories.
- Store durable architecture maps, invariants, and debugging paths in Serena. Store task progress, acceptance criteria, blockers, and operational lessons in Beads.
- Use `bd remember` only for compact, durable operational guidance. Keep the Beads memory count small because each session injects memories through `bd prime`.
- Never add project-level `.codex/hooks.json`; user-level Eyes hooks already drive lifecycle states. Project MCP configuration belongs in `.codex/config.toml`.
- Before handoff, run the required tests, update the active Bead, and record only verified outcomes and residual risk.
