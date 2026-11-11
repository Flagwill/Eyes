/**
 * Shared bridge between Eyes host adapters and the single Eyes state machine.
 *
 * Codex, Claude Code, opencode and pi all share one state machine
 * (integrations/codex/eyes-codex-hook.py). An adapter only translates its host
 * vocabulary into the engine's event shape and hands the event over; the engine
 * owns activity classification, debouncing, the user-visibility guard and the
 * dispatch to the Eyes host.
 *
 * The bridge never throws, never writes to stdout and never lets a failing
 * Eyes host disturb the agent that produced the event.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENGINE_NAME = "eyes_hook_engine.py";
const TIMEOUT_MS = 5000;

function python() {
  return process.env.EYES_HOOK_PYTHON || "python3";
}

function candidates(importMetaUrl) {
  const found = [];
  const explicit = process.env.EYES_HOOK_ENGINE;
  if (explicit) found.push(explicit);
  // Installed layout: the engine sits next to the adapter.
  found.push(new URL(`./${ENGINE_NAME}`, importMetaUrl).href);
  // Source checkout: the engine lives next to the Codex adapter.
  found.push(new URL("../codex/eyes-codex-hook.py", importMetaUrl).href);
  return found;
}

/** Resolve the shared state machine for an adapter living at importMetaUrl. */
export function resolveEngine(importMetaUrl) {
  for (const candidate of candidates(importMetaUrl)) {
    const path = candidate.startsWith("file:") ? fileURLToPath(candidate) : candidate;
    try {
      if (existsSync(path)) return path;
    } catch {
      // A path we cannot stat is not the engine.
    }
  }
  return null;
}

function run(engine, event) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(python(), [engine], {
        stdio: ["pipe", "ignore", "ignore"],
        // The engine must survive its host. opencode stops its whole
        // process group when a run ends, and an engine that is torn down
        // between reading an event and dispatching it loses that state.
        detached: true,
      });
    } catch {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process already exited.
      }
    }, TIMEOUT_MS);
    if (typeof timer.unref === "function") timer.unref();
    const settle = () => {
      clearTimeout(timer);
      resolve();
    };
    child.on("error", settle);
    child.on("close", settle);
    try {
      child.stdin.end(JSON.stringify(event));
    } catch {
      settle();
    }
  });
}

/**
 * Build a send() for one host adapter. Calls are serialized so the engine sees
 * events in the order the host produced them.
 */
export function createBridge(importMetaUrl) {
  const engine = resolveEngine(importMetaUrl);
  // A host can evaluate this module more than once in one process and give
  // every copy its own bridge. The queue has to be shared as well, otherwise
   // two copies run the state machine at the same time and they fight over
   // the same session lock.
  const scope = globalThis;
  const key = `__eyesBridgeQueue:${engine}`;
  if (!scope[key]) scope[key] = Promise.resolve();
  return function send(event) {
    if (!engine || !event) return Promise.resolve();
    scope[key] = scope[key].then(() => run(engine, event)).catch(() => {});
    return scope[key];
  };
}
