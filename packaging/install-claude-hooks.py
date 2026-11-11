#!/usr/bin/env python3
"""Install the Eyes Claude Code hooks without replacing unrelated settings."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any

MARKER = "eyes-claude-hook.py"


def source_directory() -> Path:
    return Path(__file__).resolve().parents[1] / "integrations"


def claude_home(argument: str | None) -> tuple[Path, bool]:
    """Return the config directory and whether the person chose it explicitly."""
    if argument:
        return Path(argument).expanduser(), True
    configured = os.environ.get("CLAUDE_CONFIG_DIR")
    if configured:
        return Path(configured).expanduser(), True
    return Path.home() / ".claude", False


def is_eyes_hook(hook: Any) -> bool:
    if not isinstance(hook, dict) or hook.get("type") != "command":
        return False
    command = hook.get("command")
    return isinstance(command, str) and MARKER in command


def merge_hooks(existing: Any, template: dict[str, Any]) -> dict[str, Any]:
    if existing is None:
        config: dict[str, Any] = {}
    elif isinstance(existing, dict):
        config = existing
    else:
        raise ValueError("settings.json must contain a JSON object")

    events = config.setdefault("hooks", {})
    if not isinstance(events, dict):
        raise ValueError("settings.json field hooks must contain a JSON object")

    for event, current in list(events.items()):
        if not isinstance(current, list):
            raise ValueError(f"settings.json field hooks.{event} must contain an array")
        preserved: list[Any] = []
        for group in current:
            if not isinstance(group, dict) or not isinstance(group.get("hooks"), list):
                preserved.append(group)
                continue
            unrelated = [hook for hook in group["hooks"] if not is_eyes_hook(hook)]
            if not unrelated:
                continue
            if len(unrelated) == len(group["hooks"]):
                preserved.append(group)
            else:
                preserved.append({**group, "hooks": unrelated})
        if preserved:
            events[event] = preserved
        else:
            del events[event]

    for event, groups in template["hooks"].items():
        events[event] = events.get(event, []) + groups
    return config


def atomic_write(destination: Path, writer: Any, mode: int) -> None:
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=destination.parent, prefix=f".{destination.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(descriptor, "wb") as target:
            writer(target)
        os.chmod(temporary_name, mode)
        os.replace(temporary_name, destination)
    finally:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass


def atomic_copy(source: Path, destination: Path, mode: int) -> None:
    def write(target: Any) -> None:
        with source.open("rb") as original:
            shutil.copyfileobj(original, target)

    atomic_write(destination, write, mode)


def atomic_json(destination: Path, value: dict[str, Any], mode: int) -> None:
    payload = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    atomic_write(destination, lambda target: target.write(payload), mode)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install Eyes lifecycle hooks into the user Claude Code settings."
    )
    parser.add_argument(
        "--claude-home",
        help="Claude Code configuration directory; defaults to CLAUDE_CONFIG_DIR or ~/.claude",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs and show target paths without changing files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = source_directory()
    adapter_source = source / "claude" / "eyes-claude-hook.py"
    engine_source = source / "codex" / "eyes-codex-hook.py"
    config_source = source / "claude" / "settings-hooks.json"
    root, explicit = claude_home(args.claude_home)

    # Do not create ~/.claude for someone who does not use Claude Code.
    if not explicit and not root.is_dir():
        print(f"Eyes: Claude Code not found at {root}; skipped hooks.")
        return 0

    adapter_destination = root / "hooks" / "eyes-claude-hook.py"
    engine_destination = root / "hooks" / "eyes_hook_engine.py"
    config_destination = root / "settings.json"

    try:
        template = json.loads(config_source.read_text(encoding="utf-8"))
        if not isinstance(template, dict) or not isinstance(template.get("hooks"), dict):
            raise ValueError("hook template is missing the hooks object")
        existing = None
        mode = 0o600
        if config_destination.exists():
            existing = json.loads(config_destination.read_text(encoding="utf-8"))
            mode = stat.S_IMODE(config_destination.stat().st_mode)
        merged = merge_hooks(existing, template)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"Eyes: cannot install Claude Code hooks: {error}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"Would install {adapter_destination} and {engine_destination}")
        print(f"Would merge Eyes hooks into {config_destination}")
        return 0

    try:
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        # The engine is the Codex adapter, shared so the state machine exists once.
        atomic_copy(engine_source, engine_destination, 0o644)
        atomic_copy(adapter_source, adapter_destination, 0o755)
        atomic_json(config_destination, merged, mode)
    except OSError as error:
        print(f"Eyes: cannot install Claude Code hooks: {error}", file=sys.stderr)
        return 1

    print(f"Eyes Claude Code hooks installed in {root}")
    print("Restart running Claude Code sessions (or review /hooks) to load them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
