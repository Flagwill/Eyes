#!/usr/bin/env python3
"""Install the Eyes opencode plugin and Pi extension without touching anything else.

Both hosts load a single entry file next to a copy of the shared state machine:

* opencode loads ``~/.config/opencode/plugins/eyes/index.ts``;
* Pi loads ``~/.pi/agent/extensions/eyes/index.ts``.

Each directory also receives the shared bridge and a copy of
``integrations/codex/eyes-codex-hook.py`` as ``eyes_hook_engine.py``, so the
state machine exists once in the source tree and is reused by every host.

A host whose configuration directory does not exist is skipped: the installer
never creates a home for a tool the person does not use.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

ENGINE_SOURCE = Path("integrations") / "codex" / "eyes-codex-hook.py"
BRIDGE_SOURCE = Path("integrations") / "plugins" / "eyes-bridge.mjs"

TARGETS = {
    "opencode": {
        "label": "opencode plugin",
        "home": Path.home() / ".config" / "opencode",
        "directory": ("plugins", "eyes"),
        "adapter": "eyes-opencode.ts",
    },
    "pi": {
        "label": "Pi extension",
        "home": Path.home() / ".pi" / "agent",
        "directory": ("extensions", "eyes"),
        "adapter": "eyes-pi.ts",
    },
}


def source_directory() -> Path:
    return Path(__file__).resolve().parents[1] / "integrations"


def atomic_write(destination: Path, writer, mode: int) -> None:
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
    def write(target) -> None:
        with source.open("rb") as original:
            shutil.copyfileobj(original, target)

    atomic_write(destination, write, mode)


def home_for(host: str, argument: str | None) -> tuple[Path, bool]:
    """Return the host configuration directory and whether it was chosen explicitly."""
    if argument:
        return Path(argument).expanduser(), True
    if host == "opencode":
        configured = os.environ.get("OPENCODE_CONFIG_DIR")
        if configured:
            return Path(configured).expanduser(), True
    return TARGETS[host]["home"], False


def install(host: str, argument: str | None, dry_run: bool) -> int:
    target = TARGETS[host]
    root, explicit = home_for(host, argument)

    if not explicit and not root.is_dir():
        print(f"Eyes: {target['label']} not found at {root}; skipped.")
        return 0

    source = source_directory()
    adapter_source = source / "plugins" / target["adapter"]
    bridge_source = source / "plugins" / BRIDGE_SOURCE.name
    engine_source = source / "codex" / ENGINE_SOURCE.name
    for required in (adapter_source, bridge_source, engine_source):
        if not required.is_file():
            print(f"Eyes: cannot install {target['label']}: {required} is missing.", file=sys.stderr)
            return 1

    directory = root.joinpath(*target["directory"])
    destination = directory / "index.ts"
    if dry_run:
        print(f"Would install {target['label']} in {directory}")
        return 0

    try:
        atomic_copy(adapter_source, destination, 0o644)
        atomic_copy(bridge_source, directory / BRIDGE_SOURCE.name, 0o644)
        atomic_copy(engine_source, directory / "eyes_hook_engine.py", 0o644)
    except OSError as error:
        print(f"Eyes: cannot install {target['label']}: {error}", file=sys.stderr)
        return 1

    print(f"Eyes {target['label']} installed in {directory}")
    if host == "pi":
        # Pi reads its extensions when a session starts. A session that is
        # already running keeps the extensions it started with, so the user
        # has to reload them before Eyes reacts to that session.
        print(
            "Eyes: open Pi sessions keep their old extensions. "
            "Run /reload in them (or restart Pi) to pick up the Eyes extension."
        )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install the Eyes opencode plugin and Pi extension."
    )
    parser.add_argument(
        "--only",
        choices=sorted(TARGETS),
        help="Install for one host only; by default both hosts are handled",
    )
    parser.add_argument(
        "--opencode-home",
        help="opencode configuration directory; defaults to OPENCODE_CONFIG_DIR or ~/.config/opencode",
    )
    parser.add_argument(
        "--pi-home",
        help="Pi agent directory; defaults to ~/.pi/agent",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs and show target paths without changing files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    hosts = [args.only] if args.only else sorted(TARGETS)
    status = 0
    for host in hosts:
        argument = args.opencode_home if host == "opencode" else args.pi_home
        status = install(host, argument, args.dry_run) or status
    return status


if __name__ == "__main__":
    raise SystemExit(main())
