#!/usr/bin/env python3
"""Translate Codex lifecycle hooks into low-cost Eyes commands."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


ACTIVE_COMMANDS = {
    "start",
    "thinking",
    "working",
    "waiting",
}


def runtime_socket() -> Path:
    explicit = os.environ.get("EYES_CODEX_SOCKET")
    if explicit:
        return Path(explicit)
    runtime = os.environ.get("XDG_RUNTIME_DIR")
    if runtime:
        return Path(runtime) / "eyes.sock"
    return Path("/tmp") / f"eyes-{os.getuid()}.sock"


def state_directory() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR")
    if runtime:
        return Path(runtime) / "eyes-codex"
    return Path("/tmp") / f"eyes-codex-{os.getuid()}"


def eyes_executable() -> Path | None:
    explicit = os.environ.get("EYES_CODEX_EYES")
    source_root = Path(__file__).resolve().parents[2]
    candidates = (
        explicit,
        Path.home() / ".local" / "bin" / "eyes",
        source_root / "bin" / "eyes",
        shutil.which("eyes"),
    )
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate)
        if path.is_file() and os.access(path, os.X_OK):
            return path
    return None


def send_to_running_host(command: str) -> bool:
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(0.25)
    try:
        client.connect(str(runtime_socket()))
        client.sendall((command + "\n").encode("utf-8"))
        client.shutdown(socket.SHUT_WR)
        while client.recv(4096):
            pass
        return True
    except OSError:
        return False
    finally:
        client.close()


def launch_host(command: str) -> None:
    if command not in ACTIVE_COMMANDS:
        return
    executable = eyes_executable()
    if executable is None:
        return
    try:
        subprocess.Popen(
            [str(executable), command],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            start_new_session=True,
        )
    except OSError:
        pass


def dispatch(command: str) -> None:
    if not send_to_running_host(command):
        launch_host(command)
        # Wait for the host to receive the command it was launched with.
        deadline = time.monotonic() + 1.2
        while time.monotonic() < deadline:
            if send_to_running_host("status"):
                return
            time.sleep(0.04)


def load_state(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {"last_command": "", "active_tools": []}
    if not isinstance(value, dict):
        return {"last_command": "", "active_tools": []}
    active = value.get("active_tools")
    return {
        "last_command": value.get("last_command", "")
        if isinstance(value.get("last_command", ""), str)
        else "",
        "active_tools": [
            item for item in active if isinstance(item, str)
        ]
        if isinstance(active, list)
        else [],
    }


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(state, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    path.chmod(0o600)


def transition(event: dict[str, Any], state: dict[str, Any]) -> str | None:
    event_name = event.get("hook_event_name")
    tool_id = event.get("tool_use_id")
    if not isinstance(tool_id, str) or not tool_id:
        tool_id = None
    active = state["active_tools"]

    if event_name == "SessionStart":
        state["active_tools"] = []
        return "idle"
    if event_name == "UserPromptSubmit":
        state["active_tools"] = []
        return "start"
    if event_name == "PreToolUse":
        if tool_id and tool_id not in active:
            active.append(tool_id)
        return "working"
    if event_name == "PostToolUse":
        if tool_id in active:
            active.remove(tool_id)
        elif not tool_id and active:
            active.pop()
        return "working" if active else "thinking"
    if event_name == "PermissionRequest":
        return "waiting"
    if event_name == "Stop":
        state["active_tools"] = []
        return "complete"
    if event_name == "SessionEnd":
        state["active_tools"] = []
        return "idle"
    return None


def handle(event: dict[str, Any]) -> None:
    session_id = event.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        return

    directory = state_directory()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    key = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:32]
    state_path = directory / f"{key}.json"
    lock_path = directory / f"{key}.lock"

    command: str | None = None
    with lock_path.open("a+", encoding="utf-8") as lock:
        lock_path.chmod(0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = load_state(state_path)
        previous = state["last_command"]
        command = transition(event, state)
        if command is not None:
            state["last_command"] = command
            save_state(state_path, state)
            if command != previous:
                # Keep dispatch ordered with concurrent hook processes.
                dispatch(command)

    if event.get("hook_event_name") == "SessionEnd":
        for path in (state_path, lock_path):
            try:
                path.unlink()
            except OSError:
                pass


def main() -> int:
    try:
        event = json.load(sys.stdin)
        if isinstance(event, dict):
            handle(event)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
