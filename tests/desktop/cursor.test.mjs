import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Run in a private D-Bus session with Eyes stopped: this exercises the actual
// host's pointer fallback and its 32 ms coalescing, without moving the mouse.
test('stationary KWin attention survives fallback ticks and reconnects', async (t) => {
  const runtime = mkdtempSync(join(tmpdir(), 'eyes-cursor-test-'));
  const env = { ...process.env, XDG_RUNTIME_DIR: runtime, QT_QPA_PLATFORM: 'offscreen' };
  const host = spawn(resolve('build/eyes-desktop'), ['--hidden'], { env, stdio: 'ignore' });
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
  const messages = [];
  async function connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://127.0.0.1:38271/');
      ws.addEventListener('error', reject, { once: true });
      ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        messages.push(message);
        if (message.attention) samples.push(message.attention);
        if (message.type === 'snapshot') resolve(ws);
      });
    });
  }

  for (let attempt = 0; attempt < 40; ++attempt) {
    if (!existsSync(join(runtime, 'eyes.sock'))) { await delay(50); continue; }
    try { socket = await connect(); break; } catch { await delay(50); }
  }
  assert.ok(socket, 'headless host must start; stop the desktop host before this test');
  const client = resolve('bin/eyes');
  execFileSync(client, ['show'], { env });
  await delay(850);
  assert.equal(samples.at(-1).active, false, 'unknown cursor must not target the origin');

  const qdbus = join(process.env.QT6_BIN_DIR || '/usr/lib/qt6/bin', 'qdbus');
  execFileSync(qdbus, ['org.eyes.Desktop', '/Cursor', 'org.eyes.Desktop.SetPosition', '320', '240'], { env });
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

  // Hidden movement must retain the latest target without waking the model or
  // broadcasting. Duplicate positions must also be silent once visible.
  execFileSync(client, ['hide'], { env });
  await delay(100);
  const hiddenCount = samples.length;
  for (const [x, y] of [[111, 99], [222, 199], [420, 260]]) {
    execFileSync(qdbus, ['org.eyes.Desktop', '/Cursor', 'org.eyes.Desktop.SetPosition', String(x), String(y)], { env });
  }
  await delay(200);
  assert.equal(samples.length, hiddenCount, 'hidden movement must not broadcast attention');
  execFileSync(client, ['show'], { env });
  await delay(100);
  assert.deepEqual(samples.at(-1), { x: 420, y: 260, active: true });
  const shownCount = samples.length;
  for (let i = 0; i < 4; i++) {
    execFileSync(qdbus, ['org.eyes.Desktop', '/Cursor', 'org.eyes.Desktop.SetPosition', '420', '260'], { env });
  }
  await delay(150);
  assert.equal(samples.length, shownCount, 'duplicate coordinates must not broadcast');

  execFileSync(client, ['complete'], { env });
  await delay(2000);
  assert.equal(JSON.parse(execFileSync(client, ['status'], { env })).visible, true);
  await delay(2800);
  assert.equal(JSON.parse(execFileSync(client, ['status'], { env })).visible, false,
    'read-only status must not cancel the completion timer');
  assert.equal(messages.at(-2).type, 'visible');
});
