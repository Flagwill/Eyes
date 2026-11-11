import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLIENT = resolve('bin/eyes');

function run(command, args, options = {}) {
  return new Promise((settle, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => settle({ code, stdout, stderr }));
  });
}

// Load the command client as a module and record every host it starts.
const LAUNCH = `
import importlib.machinery, importlib.util, json, subprocess, sys
loader = importlib.machinery.SourceFileLoader("client", sys.argv[1])
spec = importlib.util.spec_from_loader("client", loader)
client = importlib.util.module_from_spec(spec)
loader.exec_module(client)
started = []
real = subprocess.Popen
class Recorder(real):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        argv = args[0] if args else kwargs.get("args", [])
        if argv and "eyes-desktop" in str(argv[0]):
            started.append(self.pid)
client.subprocess.Popen = Recorder
client.launch_desktop()
print(json.dumps({"started": started}))
`;

test('the command client starts at most one detached host', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-client-host-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cache = join(root, 'cache');
  const binaries = join(root, 'bin');
  mkdirSync(join(cache, 'eyes'), { recursive: true });
  mkdirSync(binaries, { recursive: true });

  // A user manager that cannot be reached forces the detached fallback.
  const systemctl = join(binaries, 'systemctl');
  writeFileSync(systemctl, '#!/bin/sh\nexit 1\n');
  chmodSync(systemctl, 0o755);

  // The fallback needs a host binary. This one stays alive like a real
  // host would, so the guard can find it.
  const host = join(root, 'eyes-desktop');
  // The loop keeps the shell itself alive, so the command line still names
  // the host the way a real one does.
  writeFileSync(host, '#!/bin/sh\nwhile :; do sleep 5; done\n');
  chmodSync(host, 0o755);

  const env = {
    ...process.env,
    PATH: `${binaries}:${process.env.PATH}`,
    XDG_CACHE_HOME: cache,
    EYES_DESKTOP_BIN: host,
  };

  // A detached host from an earlier call is still alive.
  const alive = spawn(host, [], { stdio: 'ignore' });
  t.after(() => alive.kill());
  await new Promise((r) => setTimeout(r, 100));
  writeFileSync(join(cache, 'eyes', 'host.pid'), `${alive.pid}\n`);

  const guarded = await run('python3', ['-c', LAUNCH, CLIENT], { env });
  assert.equal(guarded.code, 0, guarded.stderr);
  assert.deepEqual(
    JSON.parse(guarded.stdout).started, [],
    'the client started a second host while one was still alive',
  );

  // Once that host is gone the client starts one again.
  alive.kill();
  await new Promise((r) => setTimeout(r, 200));
  rmSync(join(cache, 'eyes', 'host.pid'));

  const fresh = await run('python3', ['-c', LAUNCH, CLIENT], { env });
  assert.equal(fresh.code, 0, fresh.stderr);
  const started = JSON.parse(fresh.stdout).started;
  assert.equal(started.length, 1);
  const recorded = readFileSync(join(cache, 'eyes', 'host.pid'), 'utf8').trim();
  assert.equal(recorded, String(started[0]));
  try {
    process.kill(Number(recorded));
  } catch {
    // The host already exited on its own.
  }
});
