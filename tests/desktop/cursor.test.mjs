import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Run in a private D-Bus session with MIO stopped: this exercises the actual
// host's pointer fallback and its 32 ms coalescing, without moving the mouse.
test('stationary KWin attention survives fallback ticks and reconnects', async (t) => {
  const runtime = mkdtempSync(join(tmpdir(), 'mio-cursor-test-'));
  const env = { ...process.env, XDG_RUNTIME_DIR: runtime, QT_QPA_PLATFORM: 'offscreen' };
  const host = spawn(resolve('build/mio-desktop'), ['--hidden'], { env, stdio: 'ignore' });
  let socket;
  t.after(async () => {
    socket?.close();
    if (host.exitCode === null) {
      const exited = new Promise(resolve => host.once('exit', resolve));
      host.kill('SIGTERM');
      await exited;
    }
    rmSync(runtime, { recursive: true, force: true });
  });

  const samples = [];
  async function connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://127.0.0.1:38271/');
      ws.addEventListener('error', reject, { once: true });
      ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.attention) samples.push(message.attention);
        if (message.type === 'snapshot') resolve(ws);
      });
    });
  }

  for (let attempt = 0; attempt < 40; ++attempt) {
    if (!existsSync(join(runtime, 'mio-eyes.sock'))) { await delay(50); continue; }
    try { socket = await connect(); break; } catch { await delay(50); }
  }
  assert.ok(socket, 'headless host must start; stop the desktop host before this test');
  const client = resolve('bin/mio');
  execFileSync(client, ['show'], { env });
  await delay(850);
  assert.equal(samples.at(-1).active, false, 'unknown cursor must not target the origin');

  const qdbus = join(process.env.QT6_BIN_DIR || '/usr/lib/qt6/bin', 'qdbus');
  execFileSync(qdbus, ['com.mio.Eyes', '/Cursor', 'com.mio.Eyes.SetPosition', '320', '240'], { env });
  await delay(100);
  const first = samples.length;
  await delay(1600);
  socket.close();
  socket = await connect();
  assert.deepEqual(samples.at(-1), { x: 320, y: 240, active: true });
  for (const attention of samples.slice(first)) {
    assert.deepEqual(attention, { x: 320, y: 240, active: true },
      'stationary attention must never fall back to (0, 0)');
  }
});
