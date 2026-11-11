import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTranslator as createOpencodeTranslator,
  translateTool as translateOpencodeTool,
} from '../integrations/plugins/eyes-opencode.ts';
import {
  createTranslator as createPiTranslator,
  translateTool as translatePiTool,
} from '../integrations/plugins/eyes-pi.ts';

const ENGINE = 'integrations/codex/eyes-codex-hook.py';
const INSTALLER = 'packaging/install-agent-plugins.py';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (typeof options.input === 'string') child.stdin.end(options.input);
    else child.stdin.end();
  });
}

// Run engine events through the real state machine with a recording dispatcher
// so no Eyes host is touched.
function replay(events, t) {
  const root = mkdtempSync(join(tmpdir(), 'eyes-agent-plugins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = `
import importlib.util, json, os, pathlib, sys
spec = importlib.util.spec_from_file_location("engine", sys.argv[1])
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
engine.state_directory = lambda: pathlib.Path(os.environ["XDG_RUNTIME_DIR"]) / "eyes-codex"
engine.MIN_TRANSITION_DWELL = 0
commands = []
engine.dispatch = commands.append
for event in json.loads(sys.stdin.read()):
    engine.handle(event)
print(json.dumps(commands))
`;
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', '-c', script, ENGINE], {
      env: { ...process.env, XDG_RUNTIME_DIR: root, XDG_STATE_HOME: join(root, 'state') },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      assert.equal(code, 0, stderr);
      resolve(JSON.parse(stdout));
    });
    child.stdin.end(JSON.stringify(events));
  });
}

// Turn host events into engine events with the adapter under test.
function opencodeEvents(steps) {
  const translator = createOpencodeTranslator();
  const events = [];
  for (const step of steps) {
    const translated = step.event
      ? translator.event(step.event)
      : translator.tool(step.tool, step.phase);
    if (translated) events.push(translated);
  }
  return events;
}

function piEvents(steps) {
  const translator = createPiTranslator();
  const events = [];
  for (const step of steps) {
    if (step.lifecycle) {
      translator.setSession(step.session);
      const translated = translator.lifecycle(step.lifecycle, step.session);
      if (translated) events.push(translated);
      continue;
    }
    const translated = translator.tool(step.tool, step.phase);
    if (translated) events.push(translated);
  }
  return events;
}

const ocTool = (tool, id, input = {}, status) => ({
  tool,
  sessionID: 'oc-session',
  id,
  input,
  ...(status ? { status } : {}),
});

const ocEvent = (type, data = {}) => ({ type, data: { sessionID: 'oc-session', ...data } });

test('every adapter names the agent its events came from', () => {
  const opencode = createOpencodeTranslator();
  const pi = createPiTranslator();
  // The shared engine drops the events of the agents the user did not pick.
  const oc = opencode.event({ type: 'session.created', data: { sessionID: 's' } });
  assert.equal(oc.source, 'opencode');
  pi.setSession('s');
  assert.equal(pi.lifecycle('SessionStart').source, 'pi');
  assert.equal(opencode.tool({ tool: 'read', sessionID: 's', id: 't1' }, 'before').source,
    'opencode');
});

test('opencode tools map to purposeful Eyes activities', async (t) => {
  const events = opencodeEvents([
    { event: ocEvent('session.execution.started') },
    { tool: ocTool('read', 't1', { filePath: '/x/a.txt' }), phase: 'before' },
    { tool: ocTool('read', 't1', {}, 'completed'), phase: 'after' },
    { tool: ocTool('edit', 't2', { filePath: '/x/a.txt' }), phase: 'before' },
    { tool: ocTool('edit', 't2', {}, 'completed'), phase: 'after' },
    { tool: ocTool('write', 't3', { filePath: '/x/b.txt' }), phase: 'before' },
    { tool: ocTool('write', 't3', {}, 'completed'), phase: 'after' },
    { tool: ocTool('grep', 't4', { pattern: 'x' }), phase: 'before' },
    { tool: ocTool('grep', 't4', {}, 'completed'), phase: 'after' },
    { tool: ocTool('glob', 't5', { pattern: '**' }), phase: 'before' },
    { tool: ocTool('glob', 't5', {}, 'completed'), phase: 'after' },
    { tool: ocTool('todowrite', 't6', { todos: [] }), phase: 'before' },
    { tool: ocTool('todowrite', 't6', {}, 'completed'), phase: 'after' },
    { tool: ocTool('task', 't7', { prompt: 'p' }), phase: 'before' },
    { tool: ocTool('task', 't7', {}, 'completed'), phase: 'after' },
    { tool: ocTool('mcp__github__get_me', 't8', {}), phase: 'before' },
    { tool: ocTool('mcp__github__get_me', 't8', {}, 'completed'), phase: 'after' },
    { tool: ocTool('bash', 't9', { command: 'npm test' }), phase: 'before' },
    { tool: ocTool('bash', 't9', {}, 'completed'), phase: 'after' },
    { tool: ocTool('bash', 't10', { command: 'git commit -m x' }), phase: 'before' },
    { tool: ocTool('bash', 't10', {}, 'completed'), phase: 'after' },
    { event: ocEvent('session.execution.succeeded') },
  ]);
  assert.deepEqual((await replay(events, t)).filter((command) => command.startsWith('activity')), [
    'activity listening', 'activity reading', 'activity editing', 'activity creating',
    'activity searching', 'activity searching', 'activity planning', 'activity delegating',
    'activity mcp', 'activity testing', 'activity saving',
  ]);
});

test('opencode permissions, failures, interrupts and compaction follow the lifecycle', async (t) => {
  const events = opencodeEvents([
    { event: ocEvent('session.execution.started') },
    { tool: ocTool('bash', 'a', { command: 'make' }), phase: 'before' },
    { tool: ocTool('bash', 'a', {}, 'error'), phase: 'after' },
    { tool: ocTool('bash', 'b', { command: 'make' }), phase: 'before' },
    { tool: ocTool('bash', 'b', {}, 'error'), phase: 'after' },
    { event: ocEvent('permission.asked') },
    { event: ocEvent('session.compaction.started') },
    { event: ocEvent('session.compaction.ended') },
    { event: ocEvent('session.execution.interrupted') },
  ]);
  assert.deepEqual(await replay(events, t), [
    'activity listening', 'activity running', 'activity debugging', 'activity retrying',
    'activity blocked', 'waiting', 'activity summarizing', 'thinking', 'waiting',
  ]);
});

test('an opencode session only reports a completed turn after an execution started', async (t) => {
  const events = opencodeEvents([
    { event: ocEvent('session.created') },
    { event: ocEvent('session.idle') },
    { event: ocEvent('session.execution.started') },
    { event: ocEvent('session.execution.succeeded') },
    { event: ocEvent('session.idle') },
  ]);
  assert.deepEqual(await replay(events, t), ['idle', 'activity listening', 'complete']);
});

test('an opencode turn that ends without an execution result still completes on idle', async (t) => {
  const events = opencodeEvents([
    { event: ocEvent('session.execution.started') },
    { event: ocEvent('session.idle') },
  ]);
  assert.deepEqual(await replay(events, t), ['activity listening', 'complete']);
});

test('opencode tool names translate into the shared classifier vocabulary', () => {
  assert.equal(translateOpencodeTool('todowrite'), 'update_plan');
  assert.equal(translateOpencodeTool('list'), 'read');
  assert.equal(translateOpencodeTool('patch'), 'apply_patch');
  assert.equal(translateOpencodeTool('shell'), 'bash');
  assert.equal(translateOpencodeTool('webfetch'), 'web_search');
  assert.equal(translateOpencodeTool('task'), 'spawn_agent');
  assert.equal(translateOpencodeTool('mcp__github__get_me'), 'mcp__github__get_me');
  assert.equal(translateOpencodeTool('something_new'), 'something_new');
});

test('the state machine keeps the event when the host stops its process group', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-agent-detached-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const record = join(root, 'events.jsonl');
  const engine = join(root, 'engine.py');
  // The engine is busy while the host tears its group down, exactly like the
  // state machine that is dispatching when opencode stops its server.
  writeFileSync(engine, [
    'import json, os, sys, time',
    'event = json.load(sys.stdin)',
    'time.sleep(0.3)',
    'with open(os.environ["EYES_TEST_RECORD"], "a") as handle:',
    '    handle.write(json.dumps(event) + "\\n")',
    '',
  ].join('\n'));
  const host = join(root, 'host.mjs');
  writeFileSync(host, [
    `import { createBridge } from ${JSON.stringify(
      new URL('../integrations/plugins/eyes-bridge.mjs', import.meta.url).href,
    )};`,
    'const send = createBridge(import.meta.url);',
    'void send({ hook_event_name: "UserPromptSubmit", session_id: "detached" });',
    'setTimeout(() => process.kill(-process.pid, "SIGTERM"), 100);',
    'setTimeout(() => process.exit(0), 5000);',
    '',
  ].join('\n'));
  const child = spawn(process.execPath, [host], {
    // The host leads its own group, so it can stop that group the way
    // opencode stops its server.
    detached: true,
    env: { ...process.env, EYES_HOOK_ENGINE: engine, EYES_TEST_RECORD: record },
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await new Promise((resolveChild) => child.on('close', resolveChild));
  // The engine runs outside the group that was stopped, so it still writes.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(record)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(existsSync(record), true);
  assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')), {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'detached',
  });
});

test('the opencode translator ignores unknown and malformed events', () => {
  const translator = createOpencodeTranslator();
  assert.equal(translator.event({ type: 'session.unknown', data: { sessionID: 'x' } }), null);
  assert.equal(translator.event({ type: 'session.idle', data: {} }), null);
  assert.equal(translator.event({}), null);
  assert.equal(translator.event(undefined), null);
  assert.equal(translator.tool({ tool: 'read' }, 'before'), null);
});

const piTool = (toolName, toolCallId, input = {}, extra = {}) => ({
  toolName,
  toolCallId,
  input,
  ...extra,
});

test('pi tools map to purposeful Eyes activities', async (t) => {
  const events = piEvents([
    { lifecycle: 'UserPromptSubmit', session: 'pi-session' },
    { tool: piTool('read', 't1', { path: '/x/a.txt' }), phase: 'before' },
    { tool: piTool('read', 't1', {}, {}), phase: 'after' },
    { tool: piTool('edit', 't2', { path: '/x/a.txt' }), phase: 'before' },
    { tool: piTool('edit', 't2', {}, {}), phase: 'after' },
    { tool: piTool('write', 't3', { path: '/x/b.txt' }), phase: 'before' },
    { tool: piTool('write', 't3', {}, {}), phase: 'after' },
    { tool: piTool('grep', 't4', { pattern: 'x' }), phase: 'before' },
    { tool: piTool('grep', 't4', {}, {}), phase: 'after' },
    { tool: piTool('find', 't5', { pattern: 'x' }), phase: 'before' },
    { tool: piTool('find', 't5', {}, {}), phase: 'after' },
    { tool: piTool('bash', 't6', { command: 'npm test' }), phase: 'before' },
    { tool: piTool('bash', 't6', {}, {}), phase: 'after' },
    { tool: piTool('bash', 't7', { command: 'git commit -m x' }), phase: 'before' },
    { tool: piTool('bash', 't7', {}, {}), phase: 'after' },
    { tool: piTool('mcp__github__get_me', 't8', {}), phase: 'before' },
    { tool: piTool('mcp__github__get_me', 't8', {}, {}), phase: 'after' },
    { tool: piTool('custom_tool', 't9', {}), phase: 'before' },
    { lifecycle: 'Stop', session: 'pi-session' },
  ]);
  assert.deepEqual((await replay(events, t)).filter((command) => command.startsWith('activity')), [
    'activity listening', 'activity reading', 'activity editing', 'activity creating',
    'activity searching', 'activity searching', 'activity testing', 'activity saving',
    'activity mcp', 'activity tool',
  ]);
});

test('pi failures, aborts, compaction and shutdown follow the lifecycle', async (t) => {
  const events = piEvents([
    { lifecycle: 'UserPromptSubmit', session: 'pi-session' },
    { tool: piTool('bash', 'a', { command: 'make' }), phase: 'before' },
    { tool: piTool('bash', 'a', {}, { isError: true }), phase: 'after' },
    { tool: piTool('bash', 'b', { command: 'make' }), phase: 'before' },
    { tool: piTool('bash', 'b', {}, { isError: true }), phase: 'after' },
    { lifecycle: 'PreCompact', session: 'pi-session' },
    { lifecycle: 'PostCompact', session: 'pi-session' },
    { lifecycle: 'Interrupt', session: 'pi-session' },
    { lifecycle: 'SessionEnd', session: 'pi-session' },
  ]);
  assert.deepEqual(await replay(events, t), [
    'activity listening', 'activity running', 'activity debugging', 'activity retrying',
    'activity blocked', 'activity summarizing', 'thinking', 'waiting', 'idle',
  ]);
});

test('pi tool names translate into the shared classifier vocabulary', () => {
  assert.equal(translatePiTool('ls'), 'read');
  assert.equal(translatePiTool('find'), 'search');
  assert.equal(translatePiTool('multi_edit'), 'edit');
  assert.equal(translatePiTool('web_fetch'), 'web_search');
  assert.equal(translatePiTool('todo'), 'update_plan');
  assert.equal(translatePiTool('agent'), 'spawn_agent');
  assert.equal(translatePiTool('mcp__github__get_me'), 'mcp__github__get_me');
});

test('the installed opencode plugin drives the shared engine through its own hooks', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-oc-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const install = await run('python3', [INSTALLER, '--only', 'opencode', '--opencode-home', root]);
  assert.equal(install.code, 0, install.stderr);

  const record = join(root, 'events.jsonl');
  const recorder = join(root, 'recorder.py');
  writeFileSync(recorder, [
    'import json, os, sys',
    'with open(os.environ["EYES_TEST_RECORD"], "a") as handle:',
    '    handle.write(json.dumps(json.load(sys.stdin)) + "\\n")',
    '',
  ].join('\n'));

  const previous = { ...process.env };
  process.env.EYES_HOOK_ENGINE = recorder;
  process.env.EYES_TEST_RECORD = record;
  t.after(() => {
    process.env.EYES_HOOK_ENGINE = previous.EYES_HOOK_ENGINE;
    process.env.EYES_TEST_RECORD = previous.EYES_TEST_RECORD;
  });

  const { default: plugin } = await import(join(root, 'plugins/eyes/index.ts'));
  const hooks = new Map();
  const listeners = [];
  let closed = false;
  const ctx = {
    tool: {
      hook: async (name, callback) => {
        hooks.set(name, callback);
        return { dispose: async () => {} };
      },
    },
    event: {
      subscribe: async function* subscribe() {
        while (!closed) {
          if (listeners.length) {
            yield listeners.shift();
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
    },
  };
  await plugin.setup(ctx);
  assert.deepEqual([...hooks.keys()].sort(), ['execute.after', 'execute.before']);

  await hooks.get('execute.before')({
    tool: 'read', sessionID: 'live', id: 'call-1', input: { filePath: '/x' },
  });
  await hooks.get('execute.after')({
    tool: 'read', sessionID: 'live', id: 'call-1', input: {}, status: 'completed',
  });
  listeners.push({ type: 'session.execution.started', data: { sessionID: 'live' } });
  listeners.push({ type: 'session.idle', data: { sessionID: 'live' } });
  await new Promise((resolve) => setTimeout(resolve, 800));
  closed = true;

  const recorded = readFileSync(record, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(recorded.map((event) => event.hook_event_name), [
    'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop',
  ]);
  assert.equal(recorded[0].session_id, 'live');
  assert.equal(recorded[0].tool_name, 'read');
});

test('installer installs both hosts, is idempotent and skips absent tools', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-plugin-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const opencodeHome = join(root, 'opencode');
  const piHome = join(root, 'pi');
  mkdirSync(opencodeHome, { recursive: true });
  mkdirSync(piHome, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await run('python3', [
      INSTALLER, '--opencode-home', opencodeHome, '--pi-home', piHome,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /installed/);
    // Pi reads its extensions when a session starts, so the installer has
    // to tell the user that a session that is already running needs a
    // reload before Eyes sees its events.
    assert.match(result.stdout, /\/reload/);
  }

  const pluginDir = join(opencodeHome, 'plugins/eyes');
  const extensionDir = join(piHome, 'extensions/eyes');
  for (const directory of [pluginDir, extensionDir]) {
    assert.equal(existsSync(join(directory, 'index.ts')), true);
    assert.equal(existsSync(join(directory, 'eyes-bridge.mjs')), true);
    assert.equal(existsSync(join(directory, 'eyes_hook_engine.py')), true);
    assert.equal(statSync(join(directory, 'index.ts')).mode & 0o777, 0o644);
    assert.equal(
      readFileSync(join(directory, 'eyes_hook_engine.py'), 'utf8'),
      readFileSync(ENGINE, 'utf8'),
    );
    assert.equal(
      readFileSync(join(directory, 'eyes-bridge.mjs'), 'utf8'),
      readFileSync('integrations/plugins/eyes-bridge.mjs', 'utf8'),
    );
  }
  assert.equal(
    readFileSync(join(pluginDir, 'index.ts'), 'utf8'),
    readFileSync('integrations/plugins/eyes-opencode.ts', 'utf8'),
  );
  assert.equal(
    readFileSync(join(extensionDir, 'index.ts'), 'utf8'),
    readFileSync('integrations/plugins/eyes-pi.ts', 'utf8'),
  );

  // A machine without opencode or Pi keeps its home untouched.
  const bare = join(root, 'bare');
  mkdirSync(bare, { recursive: true });
  const skipped = await run('python3', [INSTALLER], {
    env: { ...process.env, HOME: bare, XDG_CONFIG_HOME: join(bare, '.config') },
  });
  assert.equal(skipped.code, 0, skipped.stderr);
  assert.match(skipped.stdout, /skipped/);
  assert.equal(existsSync(join(bare, '.config/opencode')), false);
  assert.equal(existsSync(join(bare, '.pi')), false);
});

test('the installed copy resolves the shared engine next to itself', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-plugin-engine-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const install = await run('python3', [INSTALLER, '--only', 'pi', '--pi-home', root]);
  assert.equal(install.code, 0, install.stderr);
  const { resolveEngine } = await import(join(root, 'extensions/eyes/eyes-bridge.mjs'));
  const resolved = resolveEngine(new URL(`file://${join(root, 'extensions/eyes/eyes-bridge.mjs')}`).href);
  assert.equal(resolved, join(root, 'extensions/eyes/eyes_hook_engine.py'));
  assert.equal(existsSync(resolved), true);
});

test('the engine copy the installers ship stays the shared state machine', () => {
  const engine = readFileSync(ENGINE, 'utf8');
  assert.match(engine, /def transition\(/);
  assert.match(engine, /def dispatch\(/);
  assert.match(engine, /def user_suppressed\(/);
});

test('the engine never blocks forever on a session lock held by a peer', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-engine-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const session = 'eyes-lock-regression';
  const key = createHash('sha256').update(session).digest('hex').slice(0, 32);
  const stateDir = join(root, 'eyes-codex');
  mkdirSync(stateDir, { recursive: true });
  const lockPath = join(stateDir, `${key}.lock`);

  // A peer holds the session lock and never gives it back.
  const holder = spawn('python3', ['-c', `
import fcntl, sys, time
handle = open(sys.argv[1], "a+")
fcntl.flock(handle, fcntl.LOCK_EX)
sys.stdout.write("held\\n")
sys.stdout.flush()
time.sleep(120)
`, lockPath]);
  holder.stdout.setEncoding('utf8');
  await new Promise((resolve) => holder.stdout.once('data', resolve));
  t.after(() => holder.kill());

  const started = Date.now();
  const result = await run('python3', [ENGINE], {
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: root,
      // Keep the test away from a real Eyes host.
      EYES_CODEX_SOCKET: join(root, 'eyes.sock'),
      EYES_CODEX_EYES: join(root, 'no-eyes-binary'),
    },
    input: JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: session,
    }),
  });
  const elapsed = Date.now() - started;

  assert.equal(result.code, 0, result.stderr);
  // The engine must give up on the lock instead of hanging the agent.
  assert.ok(elapsed < 10000, `engine blocked for ${elapsed}ms`);
});

test('a host that loads the plugin twice reports a session once', async () => {
  const opencode = await import('../integrations/plugins/eyes-opencode.ts');
  const calls = [];
  const fakeContext = {
    tool: {
      hook: async (name, handler) => { calls.push(name); },
    },
    event: {
      subscribe: async function* () {
        yield {
          type: 'session.execution.started',
          data: { sessionID: 'session-duplicate' },
        };
      },
    },
  };

  const scope = globalThis;
  delete scope.__eyesOpencodeOwner;
  const first = opencode.plugin.setup(fakeContext);
  const second = opencode.plugin.setup(fakeContext);
  await Promise.all([first, second]);
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Only the first instance may register hooks; the second one stays silent.
  assert.deepEqual(calls, ['execute.before', 'execute.after']);
  delete scope.__eyesOpencodeOwner;
});
