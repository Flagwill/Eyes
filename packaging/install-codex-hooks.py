#!/usr/bin/env python3
"""Install the Eyes Codex hooks without replacing unrelated user hooks."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any


def source_directory() -> Path:
    return Path(__file__).resolve().parents[1] / "integrations" / "codex"


def codex_home(argument: str | None) -> Path:
    if argument:
        return Path(argument).expanduser()
    configured = os.environ.get("CODEX_HOME")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".codex"


def is_eyes_hook(hook: Any) -> bool:
    if not isinstance(hook, dict) or hook.get("type") != "command":
        return False
    command = hook.get("command")
    return isinstance(command, str) and "eyes-codex-hook.py" in command


def merge_hooks(existing: Any, template: dict[str, Any]) -> dict[str, Any]:
    if existing is None:
        config: dict[str, Any] = {}
    elif isinstance(existing, dict):
        config = existing
    else:
        raise ValueError("hooks.json must contain a JSON object")

    config.setdefault("description", template["description"])
    configured_events = config.setdefault("hooks", {})
    if not isinstance(configured_events, dict):
        raise ValueError("hooks.json field hooks must contain a JSON object")

    for event, current in list(configured_events.items()):
        if not isinstance(current, list):
            raise ValueError(f"hooks.json field hooks.{event} must contain an array")

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
                cleaned = dict(group)
                cleaned["hooks"] = unrelated
                preserved.append(cleaned)
        if preserved:
            configured_events[event] = preserved
        else:
            del configured_events[event]

    for event, groups in template["hooks"].items():
        configured_events[event] = configured_events.get(event, []) + groups

    return config


def atomic_copy(source: Path, destination: Path, mode: int) -> None:
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=destination.parent, prefix=f".{destination.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(descriptor, "wb") as target, source.open("rb") as original:
            shutil.copyfileobj(original, target)
        os.chmod(temporary_name, mode)
        os.replace(temporary_name, destination)
    finally:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass


def atomic_json(destination: Path, value: dict[str, Any]) -> None:
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=destination.parent, prefix=f".{destination.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            json.dump(value, target, ensure_ascii=False, indent=2)
            target.write("\n")
        os.chmod(temporary_name, 0o600)
        os.replace(temporary_name, destination)
    finally:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install Eyes lifecycle hooks into the user Codex configuration."
    )
    parser.add_argument(
        "--codex-home",
        help="Codex configuration directory; defaults to CODEX_HOME or ~/.codex",
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
    adapter_source = source / "eyes-codex-hook.py"
    config_source = source / "hooks.json"
    destination_root = codex_home(args.codex_home)
    adapter_destination = destination_root / "hooks" / "eyes-codex-hook.py"
    config_destination = destination_root / "hooks.json"

    try:
        template = json.loads(config_source.read_text(encoding="utf-8"))
        if not isinstance(template, dict) or not isinstance(template.get("hooks"), dict):
            raise ValueError("hook template is missing the hooks object")
        existing = None
        if config_destination.exists():
            existing = json.loads(config_destination.read_text(encoding="utf-8"))
        merged = merge_hooks(existing, template)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"Eyes: cannot install Codex hooks: {error}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"Would install {adapter_destination}")
        print(f"Would merge Eyes hooks into {config_destination}")
        return 0

    try:
        destination_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        atomic_copy(adapter_source, adapter_destination, 0o755)
        atomic_json(config_destination, merged)
    except OSError as error:
        print(f"Eyes: cannot install Codex hooks: {error}", file=sys.stderr)
        return 1

    print(f"Eyes Codex hooks installed in {destination_root}")
    print(
        "If Codex reports these hooks as untrusted or modified, "
        "review them with /hooks before starting a new thread."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
