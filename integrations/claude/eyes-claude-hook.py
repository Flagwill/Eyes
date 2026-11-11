#!/usr/bin/env python3
"""Translate Claude Code lifecycle hooks into low-cost Eyes commands.

Claude Code and Codex share the same hook shape (session_id, hook_event_name,
tool_name, tool_input, tool_use_id), so the state machine, tool classification,
debouncing and the user-visibility guard live once, in the Codex adapter. This
file only maps Claude Code's differences onto that vocabulary:

* failures arrive as their own PostToolUseFailure event with a string `error`;
* user aborts are a PostToolUseFailure with is_interrupt, not an Interrupt hook;
* tool names are Claude's (Agent, WebSearch, TodoWrite, ...);
* Notification and StopFailure stand in for a permission prompt / a dead turn.

The adapter never prints anything: SessionStart stdout would be injected into
the model's context. Every error is swallowed and the exit status stays 0.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

# Claude Code tool name -> name the shared classifier already understands.
TOOL_ALIASES = {
    "Agent": "spawn_agent",
    "Task": "spawn_agent",
    "SendMessage": "send_message",
    "TodoWrite": "update_plan",
    "TaskCreate": "update_plan",
    "TaskUpdate": "update_plan",
    "EnterPlanMode": "update_plan",
    "ExitPlanMode": "update_plan",
    "AskUserQuestion": "request_user_input",
    "WebSearch": "web_search",
    "WebFetch": "web_search",
    "LSP": "search",
    "NotebookEdit": "edit_file",
    "PowerShell": "bash",
    "Monitor": "bash",
}

# Notifications that mean "Claude is blocked on the user"; idle_prompt is not
# one of them, it fires long after the turn already completed.
BLOCKING_NOTIFICATIONS = {"permission_prompt", "elicitation_dialog"}


def load_engine() -> ModuleType:
    here = Path(__file__).resolve().parent
    candidates = (
        here / "eyes_hook_engine.py",  # installed next to this adapter
        here.parent / "codex" / "eyes-codex-hook.py",  # source checkout
    )
    for path in candidates:
        if path.is_file():
            spec = importlib.util.spec_from_file_location("eyes_hook_engine", path)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return module
    raise FileNotFoundError("Eyes hook engine not found")


def normalize(event: dict[str, Any]) -> dict[str, Any] | None:
    """Return an engine-shaped event, or None when Eyes should ignore it."""
    name = event.get("hook_event_name")
    mapped = dict(event)

    tool = event.get("tool_name")
    if isinstance(tool, str):
        mapped["tool_name"] = TOOL_ALIASES.get(tool, tool)

    if name == "PostToolUseFailure":
        if event.get("is_interrupt") is True:
            mapped["hook_event_name"] = "Interrupt"
        else:
            mapped["hook_event_name"] = "PostToolUse"
            mapped["tool_response"] = {"is_error": True}
        return mapped
    if name == "PostToolUse":
        # Only structured flags count as failure; never inspect tool output.
        mapped["tool_response"] = (
            event["tool_response"]
            if isinstance(event.get("tool_response"), dict)
            else {}
        )
        return mapped
    if name == "Notification":
        # settings.json already filters by matcher; this only rejects an
        # explicitly different type if the payload carries one.
        kind = event.get("notification_type")
        if isinstance(kind, str) and kind not in BLOCKING_NOTIFICATIONS:
            return None
        mapped["hook_event_name"] = "PermissionRequest"
        return mapped
    if name == "StopFailure":
        # The turn died (rate limit, API error): nothing to celebrate.
        mapped["hook_event_name"] = "Interrupt"
        return mapped
    return mapped


def main() -> int:
    try:
        event = json.load(sys.stdin)
        if isinstance(event, dict):
            normalized = normalize(event)
            if normalized is not None:
                load_engine().handle(normalized)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
