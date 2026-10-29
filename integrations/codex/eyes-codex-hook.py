#!/usr/bin/env python3
"""Translate Codex lifecycle hooks into low-cost Eyes commands."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shlex
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
    "activity",
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


def visibility_marker() -> Path:
    state_home = Path(
        os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")
    )
    return state_home / "eyes" / "user-visibility"


def user_suppressed() -> bool:
    try:
        visibility_marker().stat()
        return True
    except FileNotFoundError:
        return False
    except OSError:
        return True


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
    if command.split()[0] not in ACTIVE_COMMANDS:
        return
    executable = eyes_executable()
    if executable is None:
        return
    try:
        subprocess.Popen(
            [str(executable), *command.split()],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            start_new_session=True,
        )
    except OSError:
        pass


def dispatch(command: str) -> None:
    if user_suppressed():
        return
    if not send_to_running_host(command):
        launch_host(command)
        # Wait for the host to receive the command it was launched with.
        deadline = time.monotonic() + 1.2
        while time.monotonic() < deadline:
            if send_to_running_host("status"):
                return
            time.sleep(0.04)


ACTIVITY_IDS = {
    "listening", "planning", "reading", "searching", "creating", "editing",
    "running", "mcp", "tool", "skill", "testing", "debugging", "reviewing",
    "saving", "delegating", "waiting", "blocked", "retrying", "summarizing",
    "complete",
}
TOOL_ACTIVITIES = ACTIVITY_IDS - {
    "listening", "debugging", "retrying", "summarizing", "blocked", "complete",
}
MIN_TRANSITION_DWELL = 0.3
IMMEDIATE_COMMANDS = {
    "waiting",
    "activity listening",
    "activity debugging",
    "activity retrying",
    "activity blocked",
    "activity summarizing",
    "activity complete",
    "complete",
    "idle",
}


def load_state(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {
            "last_command": "",
            "last_dispatched_command": "",
            "last_dispatched_at": 0.0,
            "active_tools": [],
            "active_subagents": [],
            "last_failed_activity": "",
            "failure_count": 0,
        }
    if not isinstance(value, dict):
        return {
            "last_command": "",
            "last_dispatched_command": "",
            "last_dispatched_at": 0.0,
            "active_tools": [],
            "active_subagents": [],
            "last_failed_activity": "",
            "failure_count": 0,
        }
    active = value.get("active_tools")
    subagents = value.get("active_subagents")
    last_failed_activity = value.get("last_failed_activity", "")
    failure_count = value.get("failure_count", 0)
    last_dispatched_at = value.get("last_dispatched_at", 0.0)
    return {
        "last_command": value.get("last_command", "")
        if isinstance(value.get("last_command", ""), str)
        else "",
        "last_dispatched_command": value.get("last_dispatched_command", "")
        if isinstance(value.get("last_dispatched_command", ""), str)
        else "",
        "last_dispatched_at": last_dispatched_at
        if isinstance(last_dispatched_at, (int, float))
        and not isinstance(last_dispatched_at, bool)
        and last_dispatched_at >= 0
        else 0.0,
        "active_tools": [
            {
                "id": item,
                "activity": "tool",
                "anonymous_family": None,
            }
            if isinstance(item, str) else {
                "id": item["id"],
                "activity": item["activity"],
                "anonymous_family": item.get("anonymous_family")
                if isinstance(item.get("anonymous_family"), str)
                else None,
            }
            for item in active
            if isinstance(item, str) or (
                isinstance(item, dict) and isinstance(item.get("id"), str)
                and item.get("activity") in TOOL_ACTIVITIES
            )
        ]
        if isinstance(active, list)
        else [],
        "active_subagents": [
            item for item in subagents if isinstance(item, str) and item
        ]
        if isinstance(subagents, list)
        else [],
        "last_failed_activity": last_failed_activity
        if isinstance(last_failed_activity, str)
        and last_failed_activity in TOOL_ACTIVITIES
        else "",
        "failure_count": failure_count
        if isinstance(failure_count, int)
        and not isinstance(failure_count, bool)
        and failure_count >= 0
        else 0,
    }


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(state, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    path.chmod(0o600)


def response_failed(response: Any) -> bool:
    """Use structured status fields, never output text, to detect failure."""
    if not isinstance(response, dict):
        return False
    for key in ("isError", "is_error"):
        if response.get(key) is True:
            return True
    if response.get("success") is False:
        return True
    for key in ("exit_code", "exitCode"):
        code = response.get(key)
        if isinstance(code, int) and not isinstance(code, bool) and code != 0:
            return True
    status = response.get("status")
    return isinstance(status, str) and status.lower() in {
        "error", "failed", "failure", "cancelled", "canceled", "timeout",
    }


def classify_tool(event: dict[str, Any]) -> str:
    """Inspect intent without executing or persisting any user/tool content."""
    name = event.get("tool_name", "")
    name = name.lower() if isinstance(name, str) else ""
    payload = event.get("tool_input")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except ValueError:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}
    # Only inspect fields that carry an operation, never tool outputs.
    intent = "\n".join(payload.get(key, "") for key in
                       ("cmd", "command", "code", "file_path", "path", "patch", "input")
                       if isinstance(payload.get(key), str))
    leaf = re.split(r"[./]", name)[-1]
    if re.search(r"(?:^|[/\\\s])SKILL\.md\b", intent) or leaf in {"skill", "use_skill", "load_skill"}:
        return "skill"
    # Orchestration wrappers report their nested tool names when available.
    nested = re.findall(r"\btools\.([a-zA-Z0-9_]+)\s*\(", intent) if leaf == "exec" else []
    names = [name, *[item.lower() for item in nested]]
    if any("apply_patch" in item for item in names):
        return "creating" if "*** Add File:" in intent and "*** Update File:" not in intent else "editing"
    if any(item.startswith("mcp__") for item in names):
        return "mcp"
    wrapped = leaf == "exec"
    if nested:
        leaf = nested[-1].lower()
    if leaf in {"spawn_agent", "followup_task", "send_message", "wait_agent"}:
        return "delegating"
    if leaf in {"request_user_input", "request_user_input_async"}:
        return "waiting"
    if leaf in {"update_plan", "create_plan"}:
        return "planning"
    if leaf in {"write", "write_file", "create_file"}:
        return "creating"
    if leaf in {"edit", "edit_file", "multiedit", "str_replace"}:
        return "editing"
    if leaf in {"read", "read_file", "view_image", "open_file"}:
        return "reading"
    if leaf in {"search", "search_query", "web_search", "glob", "grep"} or "web__" in name:
        return "searching"
    shell = payload.get("cmd", payload.get("command", ""))
    if not shell and wrapped:
        # A wrapper's JS is not shell code; recognize only an explicit cmd literal.
        match = re.search(r"\bcmd\s*:\s*(['\"])(.*?)\1", intent)
        shell = match.group(2) if match else ""
    if isinstance(shell, str) and shell:
        try:
            words = shlex.split(shell)
        except ValueError:
            words = []
        if words:
            program = Path(words[0]).name
            args = words[1:]
            if program in {"pytest", "ctest", "qmltestrunner"} or (
                program in {"npm", "pnpm", "yarn", "node", "python", "python3", "cargo", "go"}
                and any(arg in {"test", "--test", "pytest", "unittest"} or arg.endswith(":test") for arg in args)
            ):
                return "testing"
            if program == "git" and args:
                if args[0] in {"diff", "show", "log"}:
                    return "reviewing"
                if args[0] in {"add", "commit"}:
                    return "saving"
            if program in {"rg", "grep", "find", "fd"}:
                return "searching"
            if program in {"cat", "head", "tail", "sed", "ls", "stat"}:
                return "reading"
        return "running"
    if leaf in {"exec_command", "bash", "shell", "terminal", "write_stdin"}:
        return "running"
    return "tool"


def classify_anonymous_command(event: dict[str, Any]) -> str | None:
    """Recover one action when Codex omits its tool call ID."""
    payload = event.get("tool_input")
    if isinstance(payload, dict):
        code = payload.get("code")
        if isinstance(code, str) and "await tools." in code:
            classified = classify_tool(dict(event, tool_input={"code": code}))
            return classified if classified != "tool" else None
    classified = classify_tool(event)
    return classified if classified != "tool" else None


def completion_activity(event: dict[str, Any]) -> str | None:
    name = event.get("tool_name", "")
    if not isinstance(name, str):
        return None
    return classify_tool(dict(event, tool_input={}))


def anonymous_tool_family(activity: str) -> str:
    if activity in {"exec_command", "bash", "shell", "terminal", "write_stdin"}:
        return "shell"
    return activity


def transition(event: dict[str, Any], state: dict[str, Any]) -> str | None:
    event_name = event.get("hook_event_name")
    tool_id = event.get("tool_use_id")
    if not isinstance(tool_id, str) or not tool_id:
        tool_id = None
    active = state["active_tools"]
    active_subagents = state["active_subagents"]
    last_failed_activity = state["last_failed_activity"]
    failure_count = state["failure_count"]

    if event_name == "SessionStart":
        state["active_tools"] = []
        state["active_subagents"] = []
        state["last_failed_activity"] = ""
        state["failure_count"] = 0
        return "idle"
    if event_name == "UserPromptSubmit":
        state["active_tools"] = []
        state["active_subagents"] = []
        state["last_failed_activity"] = ""
        state["failure_count"] = 0
        return "activity listening"
    if event_name == "PreToolUse":
        activity = classify_tool(event)
        anonymous = not tool_id
        if not tool_id:
            # Keep anonymous calls balanced too; do not discard known parallel ids.
            tool_id = "anonymous-" + str(time.monotonic_ns())
        if not any(item["id"] == tool_id for item in active):
            family = anonymous_tool_family(activity) if anonymous else None
            duplicate = next(
                (
                    item for item in active
                    if family and item.get("anonymous_family") == family
                ),
                None,
            )
            if duplicate:
                duplicate["activity"] = activity
                return "activity " + activity
            active.append({
                "id": tool_id,
                "activity": activity,
                "anonymous_family": family,
            })
        current = next(item for item in active if item["id"] == tool_id)
        retrying = last_failed_activity == activity
        return "activity retrying" if retrying else (
            "activity " + current["activity"]
        )
    if event_name == "PostToolUse":
        completed = None
        if tool_id:
            completed = next((item for item in active if item["id"] == tool_id), None)
            active[:] = [item for item in active if item["id"] != tool_id]
        else:
            # Some adapter wrappers omit the impossible PostToolUse ID while
            # still reporting the following nested PreToolUse. Match that
            # nested action by replacing a same-valued anonymous slot.
            nested_activity = classify_anonymous_command(event)
            completed_activity = completion_activity(event)
            candidates = [
                (index, item) for index, item in enumerate(active)
                if item["id"].startswith("anonymous-")
            ]
            if not nested_activity:
                # Bare completion follows the newest nested action. Prefer a
                # file operation over its enclosing Shell when both are live.
                candidates.sort(key=lambda pair: (
                    pair[1]["anonymous_family"] == "shell",
                    -pair[0],
                ))
            else:
                exact_activity = next(
                    (
                        activity for activity in ("creating", "editing")
                        if completed_activity == "editing"
                        and any(
                            pair[1]["activity"] == activity
                            for pair in candidates
                        )
                    ),
                    completed_activity,
                )
                exact = next(
                    (
                        pair for pair in candidates
                        if exact_activity
                        and pair[1]["activity"] == exact_activity
                    ),
                    None,
                )
                candidates = (
                    [exact] if exact else [
                        pair for pair in candidates
                        if anonymous_tool_family(pair[1]["activity"])
                        == anonymous_tool_family(nested_activity)
                    ]
                )
            if candidates:
                completed = active.pop(candidates[0][0])
        response = event.get("tool_response")
        failed = response_failed(response)
        if failed and isinstance(completed, dict):
            state["failure_count"] = (
                failure_count + 1
                if completed["activity"] == last_failed_activity
                else 1
            )
            state["last_failed_activity"] = completed["activity"]
        elif isinstance(completed, dict) and completed["activity"] == last_failed_activity:
            state["last_failed_activity"] = ""
            state["failure_count"] = 0
        if active:
            return "activity " + active[-1]["activity"]
        if failed:
            return "activity blocked" if state["failure_count"] >= 2 else "activity debugging"
        if active_subagents:
            return "activity delegating"
        return "thinking"
    if event_name == "PermissionRequest":
        return "waiting"
    if event_name == "SubagentStart":
        agent_id = event.get("agent_id")
        if not isinstance(agent_id, str) or not agent_id:
            agent_id = "anonymous-" + str(time.monotonic_ns())
        if agent_id not in active_subagents:
            active_subagents.append(agent_id)
        return "activity delegating"
    if event_name == "SubagentStop":
        agent_id = event.get("agent_id")
        if isinstance(agent_id, str) and agent_id in active_subagents:
            active_subagents.remove(agent_id)
        else:
            for index in range(len(active_subagents) - 1, -1, -1):
                if active_subagents[index].startswith("anonymous-"):
                    active_subagents.pop(index)
                    break
        failed = response_failed(event.get("tool_response"))
        if failed:
            return "activity debugging"
        if active:
            return "activity " + active[-1]["activity"]
        return "activity delegating" if active_subagents else "activity summarizing"
    if event_name == "PreCompact":
        return "activity summarizing"
    if event_name == "PostCompact":
        if active:
            return "activity " + active[-1]["activity"]
        return "activity delegating" if active_subagents else "thinking"
    if event_name == "Interrupt":
        state["active_tools"] = []
        state["active_subagents"] = []
        state["last_failed_activity"] = ""
        state["failure_count"] = 0
        return "waiting"
    if event_name == "Stop":
        state["active_tools"] = []
        state["active_subagents"] = []
        state["last_failed_activity"] = ""
        state["failure_count"] = 0
        return "complete"
    if event_name == "SessionEnd":
        state["active_tools"] = []
        state["active_subagents"] = []
        state["last_failed_activity"] = ""
        state["failure_count"] = 0
        return "idle"
    return None


def handle(event: dict[str, Any], *, now: float | None = None) -> None:
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
        command = transition(event, state)
        if command is not None:
            dispatched = state["last_dispatched_command"]
            timestamp = time.time() if now is None else now
            changed = command != dispatched
            mature = timestamp - state["last_dispatched_at"] >= MIN_TRANSITION_DWELL
            # Starting any tool action must always reach the wallpaper. Outer
            # wrappers finish after inner work, so their short-lived restoration
            # or "thinking" state must not erase the action that just appeared.
            immediate = (
                command in IMMEDIATE_COMMANDS
                or event.get("hook_event_name") == "PreToolUse"
            )
            first_dispatch = not dispatched
            state["last_command"] = command
            if changed and (first_dispatch or immediate or mature):
                state["last_dispatched_command"] = command
                state["last_dispatched_at"] = timestamp
            save_state(state_path, state)
            if state["last_dispatched_command"] == command and changed and (
                first_dispatch or immediate or mature
            ):
                # Keep dispatch ordered with concurrent hook processes. Rapid
                # work-state changes are coalesced for readability; urgent
                # waiting, failure, retry and completion states bypass this.
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
