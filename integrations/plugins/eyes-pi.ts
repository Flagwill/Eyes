/**
 * Translate Pi lifecycle events into the shared Eyes state machine.
 *
 * Pi exposes lifecycle hooks as `pi.on(...)` handlers with a different
 * vocabulary from Codex and Claude Code, so this adapter maps them onto the
 * engine's event shape:
 *
 * * `session_start` / `session_shutdown` become SessionStart and SessionEnd;
 * * `before_agent_start` becomes UserPromptSubmit;
 * * `tool_call` / `tool_result` become PreToolUse and PostToolUse;
 * * `agent_settled` becomes Stop, or Interrupt when the run was aborted;
 * * the compaction hooks become PreCompact and PostCompact.
 *
 * The state machine itself lives once, in integrations/codex/eyes-codex-hook.py.
 * This file only translates; it never classifies tools itself beyond mapping
 * Pi's tool names onto the names the shared classifier understands.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBridge } from "./eyes-bridge.mjs";

type EngineEvent = {
  hook_event_name: string;
  session_id: string;
  source?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  tool_response?: Record<string, unknown>;
};

type PiToolEvent = {
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  isError?: boolean;
};

// Pi tool name -> the name the shared classifier already understands.
const TOOL_ALIASES: Record<string, string> = {
  bash: "bash",
  powershell: "bash",
  read: "read",
  edit: "edit",
  multi_edit: "edit",
  write: "write",
  grep: "grep",
  glob: "glob",
  find: "search",
  ls: "read",
  web_search: "web_search",
  web_fetch: "web_search",
  todo: "update_plan",
  todowrite: "update_plan",
  task: "spawn_agent",
  agent: "spawn_agent",
  subagent: "spawn_agent",
};

export function translateTool(tool: string): string {
  const name = String(tool || "").toLowerCase();
  return TOOL_ALIASES[name] ?? name;
}

const SOURCE = "pi";

function withSource(event: EngineEvent | null): EngineEvent | null {
  return event ? { ...event, source: SOURCE } : null;
}

export function createTranslator() {
  let session = "";

  function currentSession(): string {
    return session;
  }

  function setSession(value: string): void {
    session = value;
  }

  /** Map one Pi lifecycle moment onto the engine's event vocabulary. */
  function lifecycle(hookEventName: string, sessionId?: string): EngineEvent | null {
    const id = sessionId ?? session;
    if (!id) return null;
    return { hook_event_name: hookEventName, session_id: id };
  }

  function tool(event: PiToolEvent, phase: "before" | "after"): EngineEvent | null {
    const id = currentSession();
    if (!id) return null;
    if (phase === "before") {
      return {
        hook_event_name: "PreToolUse",
        session_id: id,
        tool_name: translateTool(String(event?.toolName || "")),
        tool_input: event?.input,
        tool_use_id: event?.toolCallId,
      };
    }
    return {
      hook_event_name: "PostToolUse",
      session_id: id,
      tool_name: translateTool(String(event?.toolName || "")),
      tool_input: event?.input,
      tool_use_id: event?.toolCallId,
      tool_response: event?.isError === true ? { is_error: true } : {},
    };
  }

  // The user can tell Eyes which agent to follow. Every event names the
  // agent it came from so the shared engine can drop the others.
  return {
    lifecycle: (hookEventName: string, sessionId?: string) =>
      withSource(lifecycle(hookEventName, sessionId)),
    tool: (event: PiToolEvent, phase: "before" | "after") =>
      withSource(tool(event, phase)),
    setSession,
    currentSession,
  };
}

export default function eyesExtension(pi: ExtensionAPI) {
  // Pi can reload the extension runtime and hand the same events to more
  // than one instance. Reporting one session twice would make the shared
  // state machine fight over its session lock, so only the first instance
  // in a process reports.
  const scope = globalThis as typeof globalThis & {
    __eyesPiActive?: boolean;
  };
  if (scope.__eyesPiActive) return;
  scope.__eyesPiActive = true;

  const send = createBridge(import.meta.url);
  const translator = createTranslator();

  const sessionId = (ctx: { sessionManager?: { getSessionId?: () => string } }): string => {
    try {
      const value = ctx?.sessionManager?.getSessionId?.();
      if (typeof value === "string" && value) {
        translator.setSession(value);
        return value;
      }
    } catch {
      // Fall back to the session we already know.
    }
    return translator.currentSession();
  };

  pi.on("session_start", async (_event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    send(translator.lifecycle("SessionStart", session));
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    send(translator.lifecycle("UserPromptSubmit", session));
  });

  pi.on("tool_call", async (event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    const translated = translator.tool(event as PiToolEvent, "before");
    if (translated) send(translated);
  });

  pi.on("tool_result", async (event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    const translated = translator.tool(event as PiToolEvent, "after");
    if (translated) send(translated);
  });

  pi.on("agent_settled", async (event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    const aborted = (event as { aborted?: boolean } | undefined)?.aborted === true;
    send(translator.lifecycle(aborted ? "Interrupt" : "Stop", session));
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    send(translator.lifecycle("PreCompact", session));
  });

  pi.on("session_compact", async (_event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    send(translator.lifecycle("PostCompact", session));
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const session = sessionId(ctx);
    if (!session) return;
    send(translator.lifecycle("SessionEnd", session));
  });
}
