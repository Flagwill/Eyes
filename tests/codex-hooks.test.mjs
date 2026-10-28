import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function run(command, args, env, input = '', cwd = resolve('.')) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

function runHook(input, env) {
  return run(
    'python3',
    ['integrations/codex/eyes-codex-hook.py'],
    env,
    JSON.stringify(input),
  );
}

test('lifecycle transitions preserve parallel tool activity', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-hooks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = `
import importlib.util
import json
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("eyes_codex_hook", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.state_directory = lambda: pathlib.Path(os.environ["XDG_RUNTIME_DIR"]) / "eyes-codex"
commands = []
module.dispatch = commands.append
events = json.loads(sys.stdin.read())
for event in events:
    module.handle(event)
print(json.dumps(commands))
`;
  const events = [
    { hook_event_name: 'SessionStart', session_id: 'session' },
    { hook_event_name: 'UserPromptSubmit', session_id: 'session' },
    { hook_event_name: 'PreToolUse', session_id: 'session', tool_use_id: 'tool-1' },
    { hook_event_name: 'PreToolUse', session_id: 'session', tool_use_id: 'tool-2' },
    { hook_event_name: 'PostToolUse', session_id: 'session', tool_use_id: 'tool-1' },
    { hook_event_name: 'PostToolUse', session_id: 'session', tool_use_id: 'tool-2' },
    { hook_event_name: 'PermissionRequest', session_id: 'session' },
    { hook_event_name: 'Stop', session_id: 'session' },
    { hook_event_name: 'Stop', session_id: 'session' },
    { hook_event_name: 'SessionEnd', session_id: 'session' },
  ];
  const result = await run(
    'python3',
    ['-c', source, resolve('integrations/codex/eyes-codex-hook.py')],
    { ...process.env, XDG_RUNTIME_DIR: root },
    JSON.stringify(events),
    tmpdir(),
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    'idle', 'start', 'working', 'thinking', 'waiting', 'complete', 'idle',
  ]);
  const stateDirectory = join(root, 'eyes-codex');
  assert.deepEqual(readdirSync(stateDirectory), []);
});

test('Codex hook config covers every supported display event', () => {
  const config = JSON.parse(readFileSync('integrations/codex/hooks.json', 'utf8'));
  assert.deepEqual(Object.keys(config.hooks).sort(), [
    'PermissionRequest', 'PostToolUse', 'PreToolUse',
    'SessionEnd', 'SessionStart', 'Stop', 'UserPromptSubmit',
  ]);
  for (const groups of Object.values(config.hooks)) {
    assert.ok(groups.length > 0);
    assert.ok(groups.every((group) => group.hooks.length > 0));
    assert.ok(groups.every((group) => group.hooks.every((hook) =>
      hook.command.includes('${CODEX_HOME:-$HOME/.codex}/hooks/eyes-codex-hook.py'))));
  }
});

test('malformed hook input and a missing Eyes host stay silent and successful', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-hook-errors-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = await runHook({ hook_event_name: 'UserPromptSubmit', session_id: '' }, {
    ...process.env,
    XDG_RUNTIME_DIR: root,
    EYES_CODEX_SOCKET: join(root, 'missing.sock'),
    EYES_CODEX_EYES: join(root, 'missing-eyes'),
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(existsSync(join(root, 'eyes-codex')), false);
});

test('user hook installer merges Eyes entries without replacing unrelated hooks', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = {
    description: 'Personal hooks',
    custom: { keep: true },
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: 'notify-send unrelated' }] },
        { hooks: [{ type: 'command', command: 'python3 ~/.codex/hooks/eyes-codex-hook.py' }] },
      ],
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: 'echo unrelated' },
            { type: 'command', command: 'python3 ~/.codex/hooks/eyes-codex-hook.py' },
          ],
        },
      ],
      Interrupt: [
        { hooks: [{ type: 'command', command: 'python3 ~/.codex/hooks/eyes-codex-hook.py' }] },
      ],
    },
  };
  writeFileSync(join(root, 'hooks.json'), JSON.stringify(original));

  for (let runIndex = 0; runIndex < 2; runIndex++) {
    const result = execFileSync('python3', ['packaging/install-codex-hooks.py',
      '--codex-home', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(result, /installed/);
    assert.match(result, /untrusted or modified/);
  }

  const installed = JSON.parse(readFileSync(join(root, 'hooks.json'), 'utf8'));
  const source = JSON.parse(readFileSync('integrations/codex/hooks.json', 'utf8'));
  assert.equal(installed.description, original.description);
  assert.deepEqual(installed.custom, original.custom);
  assert.deepEqual(Object.keys(installed.hooks).sort(), Object.keys(source.hooks).sort());
  assert.equal(installed.hooks.Interrupt, undefined);
  assert.equal(installed.hooks.Stop[0].hooks[0].command, 'notify-send unrelated');
  assert.equal(installed.hooks.SessionStart[0].hooks[0].command, 'echo unrelated');
  for (const groups of Object.values(installed.hooks)) {
    const commands = groups.flatMap((group) => group.hooks.map((hook) => hook.command));
    assert.equal(commands.filter((command) => command.includes('eyes-codex-hook.py')).length, 1);
  }
  assert.equal(statSync(join(root, 'hooks.json')).mode & 0o777, 0o600);
  assert.equal(statSync(join(root, 'hooks/eyes-codex-hook.py')).mode & 0o777, 0o755);
  assert.equal(readFileSync(join(root, 'hooks/eyes-codex-hook.py'), 'utf8'),
    readFileSync('integrations/codex/eyes-codex-hook.py', 'utf8'));
});

test('user hook installer refuses malformed config without partial writes', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-codex-invalid-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'hooks.json');
  writeFileSync(config, '{not json');
  const result = spawnSync('python3', ['packaging/install-codex-hooks.py',
    '--codex-home', root], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot install Codex hooks/);
  assert.equal(readFileSync(config, 'utf8'), '{not json');
  assert.equal(existsSync(join(root, 'hooks/eyes-codex-hook.py')), false);
});
