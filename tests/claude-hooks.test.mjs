import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADAPTER = 'integrations/claude/eyes-claude-hook.py';

// Drive the adapter with a recording dispatcher so no real Eyes host is touched.
function replay(events, t, { suppressed = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'eyes-claude-hooks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = `
import importlib.util, json, os, pathlib, sys
spec = importlib.util.spec_from_file_location("adapter", sys.argv[1])
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
engine = adapter.load_engine()
engine.state_directory = lambda: pathlib.Path(os.environ["XDG_RUNTIME_DIR"]) / "eyes-codex"
engine.MIN_TRANSITION_DWELL = 0
commands = []
engine.dispatch = commands.append
for event in json.loads(sys.stdin.read()):
    normalized = adapter.normalize(event)
    if normalized is not None:
        engine.handle(normalized)
print(json.dumps(commands))
`;
  const result = spawnSync('python3', ['-I', '-c', script, ADAPTER], {
    input: JSON.stringify(events),
    encoding: 'utf8',
    env: { ...process.env, XDG_RUNTIME_DIR: root, XDG_STATE_HOME: join(root, 'state') },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const base = { session_id: 'claude-session' };
const pre = (tool_name, tool_input, id) => ({
  ...base, hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: id,
});

test('Claude Code tools map to purposeful Eyes activities', (t) => {
  const events = [
    { ...base, hook_event_name: 'UserPromptSubmit' },
    pre('Read', { file_path: '/x/a.txt' }, 't1'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 't1', tool_response: {} },
    pre('Edit', { file_path: '/x/a.txt' }, 't2'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_use_id: 't2', tool_response: {} },
    pre('Write', { file_path: '/x/b.txt' }, 't3'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_use_id: 't3', tool_response: {} },
    pre('Grep', { pattern: 'x' }, 't4'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'Grep', tool_use_id: 't4', tool_response: {} },
    pre('WebSearch', { query: 'x' }, 't5'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'WebSearch', tool_use_id: 't5', tool_response: {} },
    pre('Bash', { command: 'npm test' }, 't6'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't6', tool_response: { stdout: '', stderr: '' } },
    pre('Bash', { command: 'git commit -m x' }, 't7'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't7', tool_response: {} },
    pre('mcp__github__get_me', {}, 't8'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'mcp__github__get_me', tool_use_id: 't8', tool_response: [] },
    pre('Skill', { skill: 'x' }, 't9'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_use_id: 't9', tool_response: {} },
    pre('TodoWrite', { todos: [] }, 't10'),
    { ...base, hook_event_name: 'PostToolUse', tool_name: 'TodoWrite', tool_use_id: 't10', tool_response: {} },
    pre('SomethingNew', {}, 't11'),
  ];
  assert.deepEqual(replay(events, t).filter((c) => c.startsWith('activity') && c !== 'activity listening'), [
    'activity reading', 'activity editing', 'activity creating', 'activity searching',
    'activity searching', 'activity testing', 'activity saving', 'activity mcp',
    'activity skill', 'activity planning', 'activity tool',
  ]);
});

test('failures, interrupts, permission prompts and subagents follow the Claude lifecycle', (t) => {
  const failure = (id, extra = {}) => ({
    ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_use_id: id,
    tool_input: { command: 'make' }, error: 'Exit code 2\nboom', is_interrupt: false, ...extra,
  });
  const commands = replay([
    { ...base, hook_event_name: 'UserPromptSubmit' },
    pre('Bash', { command: 'make' }, 'a'),
    failure('a'),                                   // debugging
    pre('Bash', { command: 'make' }, 'b'),          // retrying
    failure('b', { tool_input: { command: 'make' } }), // second failure: blocked
    pre('Bash', { command: 'make' }, 'c'),
    failure('c', { is_interrupt: true }),           // user abort
    { ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm x' } },
    { ...base, hook_event_name: 'Notification', notification_type: 'idle_prompt' }, // ignored
    pre('Agent', { prompt: 'p' }, 'd'),
    { ...base, hook_event_name: 'SubagentStart', agent_id: 'sub' },
    { ...base, hook_event_name: 'SubagentStop', agent_id: 'sub' },
    { ...base, hook_event_name: 'Stop' },
    { ...base, hook_event_name: 'SessionEnd' },
  ], t);
  // The idle_prompt notification is ignored and the permission request right after
  // the interrupt coalesces into the same waiting state.
  assert.deepEqual(commands, [
    'activity listening', 'activity running', 'activity debugging', 'activity retrying',
    'activity blocked', 'activity retrying', 'waiting', 'activity delegating',
    'complete', 'idle',
  ]);
});

test('blocking notifications show waiting and StopFailure never reads as complete', (t) => {
  const commands = replay([
    { ...base, hook_event_name: 'UserPromptSubmit' },
    { ...base, hook_event_name: 'Notification', notification_type: 'permission_prompt' },
    { ...base, hook_event_name: 'UserPromptSubmit' },
    { ...base, hook_event_name: 'StopFailure' },
  ], t);
  assert.deepEqual(commands, ['activity listening', 'waiting', 'activity listening', 'waiting']);
});

test('the adapter is silent, exits 0 and honors the user visibility marker', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-claude-silent-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    XDG_RUNTIME_DIR: root,
    XDG_STATE_HOME: join(root, 'state'),
    EYES_CODEX_SOCKET: join(root, 'missing.sock'),
    EYES_CODEX_EYES: join(root, 'missing-eyes'),
  };
  for (const input of ['not json', JSON.stringify({ hook_event_name: 'SessionStart', session_id: '' }),
    JSON.stringify({ ...base, hook_event_name: 'UserPromptSubmit' })]) {
    const result = spawnSync('python3', [ADAPTER], { input, env, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
  mkdirSync(join(root, 'state', 'eyes'), { recursive: true });
  writeFileSync(join(root, 'state', 'eyes', 'user-visibility'), 'hidden');
  const result = spawnSync('python3', [ADAPTER], {
    input: JSON.stringify({ ...base, hook_event_name: 'UserPromptSubmit' }), env, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('Claude hook template covers every display event with the shared command', () => {
  const config = JSON.parse(readFileSync('integrations/claude/settings-hooks.json', 'utf8'));
  assert.deepEqual(Object.keys(config.hooks).sort(), [
    'Notification', 'PermissionRequest', 'PostCompact', 'PostToolUse', 'PostToolUseFailure',
    'PreCompact', 'PreToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'StopFailure',
    'SubagentStart', 'SubagentStop', 'UserPromptSubmit',
  ]);
  for (const groups of Object.values(config.hooks)) {
    assert.ok(groups.every((group) => group.hooks.every((hook) =>
      hook.type === 'command' && hook.timeout === 2
      && hook.command === 'python3 "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/eyes-claude-hook.py"')));
  }
  // compact restarts a session mid-work and must not hide Eyes.
  assert.equal(config.hooks.SessionStart[0].matcher, 'startup|resume|clear|fork');
});

test('installer merges into settings.json, keeps unrelated settings and is idempotent', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-claude-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = {
    model: 'sonnet',
    enabledPlugins: { keep: true },
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: 'notify-send unrelated' }] },
        { hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/eyes-claude-hook.py' }] },
      ],
      PreToolUse: [{
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: 'echo unrelated' },
          { type: 'command', command: 'python3 ~/.claude/hooks/eyes-claude-hook.py' },
        ],
      }],
    },
  };
  const settings = join(root, 'settings.json');
  writeFileSync(settings, JSON.stringify(original));
  chmodSync(settings, 0o644);
  for (let run = 0; run < 2; run++) {
    const out = execFileSync('python3', ['packaging/install-claude-hooks.py', '--claude-home', root],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(out, /installed/);
  }
  const installed = JSON.parse(readFileSync(settings, 'utf8'));
  const template = JSON.parse(readFileSync('integrations/claude/settings-hooks.json', 'utf8'));
  assert.equal(installed.model, 'sonnet');
  assert.deepEqual(installed.enabledPlugins, { keep: true });
  assert.deepEqual(Object.keys(installed.hooks).sort(), Object.keys(template.hooks).sort());
  assert.equal(installed.hooks.Stop[0].hooks[0].command, 'notify-send unrelated');
  assert.equal(installed.hooks.PreToolUse[0].matcher, 'Bash');
  assert.equal(installed.hooks.PreToolUse[0].hooks[0].command, 'echo unrelated');
  for (const groups of Object.values(installed.hooks)) {
    const commands = groups.flatMap((group) => group.hooks.map((hook) => hook.command));
    assert.equal(commands.filter((command) => command.includes('eyes-claude-hook.py')).length, 1);
  }
  assert.equal(statSync(settings).mode & 0o777, 0o644);
  assert.equal(statSync(join(root, 'hooks/eyes-claude-hook.py')).mode & 0o777, 0o755);
  assert.equal(readFileSync(join(root, 'hooks/eyes-claude-hook.py'), 'utf8'), readFileSync(ADAPTER, 'utf8'));
  assert.equal(readFileSync(join(root, 'hooks/eyes_hook_engine.py'), 'utf8'),
    readFileSync('integrations/codex/eyes-codex-hook.py', 'utf8'));
});

test('an installed copy runs standalone from the Claude config directory', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-claude-standalone-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('python3', ['packaging/install-claude-hooks.py', '--claude-home', join(root, 'claude')],
    { stdio: 'ignore' });
  const result = spawnSync('python3', [join(root, 'claude/hooks/eyes-claude-hook.py')], {
    input: JSON.stringify({ ...base, hook_event_name: 'Stop' }),
    encoding: 'utf8',
    env: {
      ...process.env, XDG_RUNTIME_DIR: root, XDG_STATE_HOME: join(root, 'state'),
      EYES_CODEX_SOCKET: join(root, 'missing.sock'), EYES_CODEX_EYES: join(root, 'none'),
    },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  // The engine really ran: it created its per-session state.
  assert.equal(existsSync(join(root, 'eyes-codex')), true);
});

test('installer refuses malformed settings and skips machines without Claude Code', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-claude-invalid-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = join(root, 'settings.json');
  writeFileSync(settings, '{not json');
  const bad = spawnSync('python3', ['packaging/install-claude-hooks.py', '--claude-home', root],
    { encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /cannot install Claude Code hooks/);
  assert.equal(readFileSync(settings, 'utf8'), '{not json');
  assert.equal(existsSync(join(root, 'hooks')), false);

  // No explicit target and no ~/.claude: leave the machine untouched.
  const home = join(root, 'home');
  mkdirSync(home);
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_CONFIG_DIR;
  const skipped = spawnSync('python3', ['packaging/install-claude-hooks.py'], { encoding: 'utf8', env });
  assert.equal(skipped.status, 0);
  assert.match(skipped.stdout, /skipped/);
  assert.equal(existsSync(join(home, '.claude')), false);
});
