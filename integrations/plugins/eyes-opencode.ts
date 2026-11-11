/**
 * Translate opencode lifecycle events into the shared Eyes state machine.
 *
 * opencode has no hook payload like Codex or Claude Code, so this adapter maps
 * the opencode plugin API onto the engine's event vocabulary:
 *
 * * `ctx.tool.hook("execute.before"/"execute.after")` become PreToolUse and
 *   PostToolUse;
 * * the opencode event stream supplies the session lifecycle (execution
 *   started, permission asked, compaction, idle, interrupted, deleted).
 *
 * The state machine itself lives once, in integrations/codex/eyes-codex-hook.py.
 * This file only translates; it never classifies tools itself beyond mapping
 * opencode's tool names onto the names the shared classifier understands.
 */

import type { Plugin } from "@opencode/plugin";
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

type OpencodeEvent = {
  type?: string;
  data?: Record<string, unknown>;
};

type ToolHookInput = {
  tool: string;
  sessionID: string;
  id: string;
  input: unknown;
  status?: "completed" | "error";
};

// opencode tool name -> the name the shared classifier already understands.
const TOOL_ALIASES: Record<string, string> = {
  bash: "bash",
  shell: "bash",
  edit: "edit",
  write: "write",
  read: "read",
  grep: "grep",
  glob: "glob",
  list: "read",
  patch: "apply_patch",
  todowrite: "update_plan",
  todoread: "update_plan",
  webfetch: "web_search",
  task: "spawn_agent",
};

export function translateTool(tool: string): string {
  const name = String(tool || "").toLowerCase();
  return TOOL_ALIASES[name] ?? name;
}

const SOURCE = "opencode";

function withSource(event: EngineEvent | null): EngineEvent | null {
  return event ? { ...event, source: SOURCE } : null;
}

/**
 * Holds the little state opencode needs: which sessions currently have an
 * execution in flight, so a session that was never asked anything does not
 * report a completed turn.
 */
export function createTranslator() {
  const running = new Set<string>();

  function event(raw: OpencodeEvent): EngineEvent | null {
    const type = typeof raw?.type === "string" ? raw.type : "";
    const data = raw?.data && typeof raw.data === "object" ? raw.data : {};
    const session = typeof data.sessionID === "string" ? data.sessionID : "";
    if (!session) return null;
    switch (type) {
      case "session.created":
        return { hook_event_name: "SessionStart", session_id: session };
      case "session.execution.started":
        running.add(session);
        return { hook_event_name: "UserPromptSubmit", session_id: session };
      case "session.execution.succeeded":
        running.delete(session);
        return { hook_event_name: "Stop", session_id: session };
      case "session.idle":
        // Some flows end without an execution result; idle still closes the turn.
        if (!running.delete(session)) return null;
        return { hook_event_name: "Stop", session_id: session };
      case "permission.asked":
        return { hook_event_name: "PermissionRequest", session_id: session };
      case "session.compaction.started":
        return { hook_event_name: "PreCompact", session_id: session };
      case "session.compaction.ended":
        return { hook_event_name: "PostCompact", session_id: session };
      case "session.execution.interrupted":
      case "session.execution.failed":
        running.delete(session);
        return { hook_event_name: "Interrupt", session_id: session };
      case "session.deleted":
        running.delete(session);
        return { hook_event_name: "SessionEnd", session_id: session };
      default:
        return null;
    }
  }

  function tool(input: ToolHookInput, phase: "before" | "after"): EngineEvent | null {
    const session = typeof input?.sessionID === "string" ? input.sessionID : "";
    if (!session) return null;
    if (phase === "before") {
      return {
        hook_event_name: "PreToolUse",
        session_id: session,
        tool_name: translateTool(input.tool),
        tool_input: input.input,
        tool_use_id: input.id,
      };
    }
    const failed = input.status === "error";
    return {
      hook_event_name: "PostToolUse",
      session_id: session,
      tool_name: translateTool(input.tool),
      tool_input: input.input,
      tool_use_id: input.id,
      tool_response: failed ? { is_error: true } : {},
    };
  }

  // The user can tell Eyes which agent to follow. Every event names the
  // agent it came from so the shared engine can drop the others.
  return {
    event: (raw: OpencodeEvent) => withSource(event(raw)),
    tool: (input: ToolHookInput, phase: "before" | "after") =>
      withSource(tool(input, phase)),
  };
}

export const plugin: Plugin = {
  id: "eyes",
  async setup(ctx) {
    // opencode can evaluate this module more than once inside one process
    // and call setup() for every copy. Each copy would then subscribe to the
    // same event stream and report the same session several times, which
    // makes concurrent hosts fight over one session lock. globalThis is
    // shared by every copy in the process, so the first copy takes the role
    // and the others stay silent.
    const scope = globalThis as typeof globalThis & {
      __eyesOpencodeOwner?: object;
    };
    const owner = {};
    if (scope.__eyesOpencodeOwner) return;
    scope.__eyesOpencodeOwner = owner;

    const send = createBridge(import.meta.url);
    const translator = createTranslator();
    let stopped = false;

    await ctx.tool.hook("execute.before", async (input) => {
      const translated = translator.tool(input as ToolHookInput, "before");
      if (translated) send(translated);
    });

    await ctx.tool.hook("execute.after", async (input) => {
      const translated = translator.tool(input as ToolHookInput, "after");
      if (translated) send(translated);
    });

    void (async () => {
      try {
        for await (const raw of ctx.event.subscribe()) {
          if (stopped) break;
          const translated = translator.event(raw as OpencodeEvent);
          if (translated) send(translated);
        }
      } catch {
        // The event stream is optional; a closed stream must not break opencode.
      }
    })();

    return () => {
      stopped = true;
      if (scope.__eyesOpencodeOwner === owner) {
        delete scope.__eyesOpencodeOwner;
      }
    };
  },
};

export default plugin;
