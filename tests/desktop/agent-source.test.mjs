import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// Run with the desktop host stopped, in a private D-Bus and runtime directory.
test('the host reports and switches the agent it follows', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-agent-host-'));
  const runtime = join(root, 'run');
  const state = join(root, 'state');
  const configHome = join(root, 'config');
  const commands = join(root, 'commands');
  mkdirSync(runtime, {mode: 0o700});
  mkdirSync(configHome, {recursive: true});
  mkdirSync(commands, {recursive: true});

  // The host restores the wallpaper on startup. The mock keeps the real
  // Plasma configuration untouched.
  const mock = join(root, 'configure-wallpaper.py');
  writeFileSync(mock, `#!/usr/bin/env python3
import json
print(json.dumps({"ok": True, "mode": "restore", "changed": False,
                  "changedIds": [], "pending": []}))
`, {mode: 0o755});
  chmodSync(mock, 0o755);
  const systemctl = join(commands, 'systemctl');
  writeFileSync(systemctl, `#!/bin/sh
case "$*" in
  *is-active*) exit 1 ;;
esac
exit 0
`, {mode: 0o755});
  chmodSync(systemctl, 0o755);

  const env = {
    ...process.env,
    PATH: `${commands}:${process.env.PATH}`,
    XDG_RUNTIME_DIR: runtime,
    XDG_STATE_HOME: state,
    XDG_CONFIG_HOME: configHome,
    QT_QPA_PLATFORM: 'offscreen',
    EYES_CONFIGURE_PLASMA_WALLPAPER: mock,
  };
  delete env.EYES_DISABLE_WALLPAPER_GUARD;

  const host = spawn(resolve('build/eyes-desktop'), ['--hidden'], {
    env,
    stdio: 'ignore',
  });
  t.after(async () => {
    if (host.exitCode === null) {
      const exited = new Promise(done => host.once('exit', done));
      host.kill('SIGTERM');
      await exited;
    }
    rmSync(root, {recursive: true, force: true});
  });

  for (let i = 0; i < 50 && !existsSync(join(runtime, 'eyes.sock'))
      && host.exitCode === null; i++) {
    await delay(50);
  }
  assert.equal(host.exitCode, null,
    'the real host must start; stop the installed host before running this test');

  const client = resolve('bin/eyes');
  const marker = join(state, 'eyes', 'agent-source');
  const run = (...args) => execFileSync(client, args, {env, encoding: 'utf8'});
  const status = () => JSON.parse(run('status'));

  // Without a choice every agent stays in charge.
  assert.equal(status().agent, 'all');

  run('agent', 'codex');
  assert.equal(readFileSync(marker, 'utf8').trim(), 'codex');
  assert.equal(statSync(marker).mode & 0o777, 0o600);
  assert.equal(status().agent, 'codex');

  let failed = false;
  try {
    execFileSync(client, ['agent', 'unknown-agent'], {env, encoding: 'utf8'});
  } catch (error) {
    failed = error.status === 2;
    assert.match(error.stderr, /unknown-agent/);
  }
  assert.equal(failed, true, 'an unknown agent must be refused');
  assert.equal(status().agent, 'codex',
    'a refused choice must not change the followed agent');

  run('agent', 'all');
  assert.equal(status().agent, 'all');
});
