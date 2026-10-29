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
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// Run with the desktop host stopped, in a private D-Bus and runtime directory.
test('the real host restores at startup and around each visible cycle', async t => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-host-'));
  const runtime = join(root, 'run');
  const state = join(root, 'state');
  const configHome = join(root, 'config');
  const commands = join(root, 'commands');
  const config = join(
    configHome,
    'plasma-org.kde.plasma.desktop-appletsrc',
  );
  const calls = join(root, 'wallpaper-calls.jsonl');
  const serviceCalls = join(root, 'service-calls.log');
  const mock = join(root, 'configure-wallpaper.py');
  mkdirSync(runtime, {mode: 0o700});
  mkdirSync(configHome, {recursive: true});
  mkdirSync(commands, {recursive: true});
  writeFileSync(config, `[Containments][7]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][7][Wallpaper][org.kde.image][General]
Image=file:///origin.jpg
`);
  writeFileSync(mock, `#!/usr/bin/env python3
import json
import os
import sys
import time

with open(os.environ["EYES_WALLPAPER_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
    log.flush()
    os.fsync(log.fileno())

if "--mount" in sys.argv:
    time.sleep(0.35)

print(json.dumps({
    "ok": True,
    "mode": "restore" if "--restore" in sys.argv else "mount",
    "changed": True,
    "changedIds": ["7"],
    "pending": [],
}))
`, {mode: 0o755});
  chmodSync(mock, 0o755);
  const systemctl = join(commands, 'systemctl');
  writeFileSync(systemctl, `#!/bin/sh
printf '%s\\n' "$*" >> "$EYES_SERVICE_LOG"
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
    EYES_WALLPAPER_LOG: calls,
    EYES_SERVICE_LOG: serviceCalls,
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

  const operations = () => existsSync(calls)
    ? readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean)
      .map(line => JSON.parse(line))
      .map(args => args.includes('--restore') ? 'restore' : 'mount')
    : [];
  async function waitForOperation(operation, count) {
    for (let i = 0; i < 100; i++) {
      const matching = operations().filter(item => item === operation);
      if (matching.length >= count)
        return;
      await delay(50);
    }
    assert.fail(`timed out waiting for ${operation} #${count}: ${operations()}`);
  }

  await waitForOperation('restore', 1);
  const client = resolve('bin/eyes');
  const command = (...args) => execFileSync(client, args, {
    env,
    encoding: 'utf8',
  });

  command('show');
  await waitForOperation('mount', 1);
  command('hide');
  await delay(500);
  assert.deepEqual(operations(), ['restore', 'mount'],
    'a mount finishing after hide must not bypass the fade delay');
  await waitForOperation('restore', 2);
  command('show');
  await waitForOperation('mount', 2);

  const exited = new Promise(done => host.once('exit', done));
  command('quit');
  await exited;
  assert.equal(host.exitCode, 0);
  assert.deepEqual(operations(), [
    'restore',
    'mount',
    'restore',
    'mount',
    'restore',
  ]);
  assert.doesNotMatch(
    existsSync(serviceCalls) ? readFileSync(serviceCalls, 'utf8') : '',
    /--user stop eyes-desktop\.service/,
    'quit must wait for the host to restore before stopping systemd',
  );
});
