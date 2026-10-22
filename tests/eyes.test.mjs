import test from 'node:test';
import assert from 'node:assert/strict';
import { Spring, getPose, blinkAmount, getLayout, getPointerGaze, getAttentionPose, getLight, getLightGeometry, eyePath, Eyes, EMOTIONS, attentionEnvelope, getAmbientGaze } from '../eyes.js';

test('every emotion shares a finite morphable pose with positive eye sizes', () => {
  const keys = Object.keys(getPose('idle'));
  for (const emotion of EMOTIONS) {
    const pose = getPose(emotion.id);
    assert.deepEqual(Object.keys(pose), keys);
    assert.ok(Object.values(pose).every(Number.isFinite));
    for (const dimension of ['lw', 'lh', 'rw', 'rh']) assert.ok(pose[dimension] > 0);
  }
  assert.throws(() => getPose('invalid'), RangeError);
  const mutated = getPose('idle');
  mutated.lw = 0;
  assert.ok(getPose('idle').lw > 0);
});

test('spring morphs stay continuous and converge, including after long frame gaps', () => {
  for (const fps of [15, 30, 60, 120]) {
    const spring = new Spring(0);
    let sawOvershoot = false;
    for (let i = 0; i < fps * 4; i++) {
      const before = spring.value;
      spring.step(100, 1 / fps);
      sawOvershoot ||= spring.value > 100;
      assert.ok(Number.isFinite(spring.value));
      assert.ok(Math.abs(spring.value - before) < 45);
    }
    assert.ok(sawOvershoot, 'a small overshoot gives the motion its spring');
    assert.ok(Math.abs(spring.value - 100) < 0.01);
    spring.step(-100, 3600);
    assert.ok(Number.isFinite(spring.value));
    assert.ok(Math.abs(spring.value) < 200);
  }
});

test('all emotion transitions remain finite and converge to their new pose', () => {
  for (const from of EMOTIONS) for (const to of EMOTIONS) {
    const previous = getPose(from.id);
    const target = getPose(to.id);
    for (const key of Object.keys(previous)) {
      const spring = new Spring(previous[key]);
      for (let i = 0; i < 240; i++) spring.step(target[key], 1 / 60);
      assert.ok(Math.abs(spring.value - target[key]) < 0.01, `${from.id} → ${to.id}: ${key}`);
    }
  }
});

test('blink closes quickly, opens slowly, supports a second blink, and returns to open', () => {
  assert.equal(blinkAmount(-1), 0);
  assert.equal(blinkAmount(0), 0);
  assert.equal(blinkAmount(0.1), 1);
  assert.ok(blinkAmount(0.2) > 0 && blinkAmount(0.2) < 1);
  assert.equal(blinkAmount(0.5), 0);
  assert.equal(blinkAmount(0.49, true), 1);
  assert.equal(blinkAmount(1, true), 0);
  for (let t = -0.1; t < 1; t += 0.001) assert.ok(blinkAmount(t, true) >= 0 && blinkAmount(t, true) <= 1);
});

test('happy eyes have two parallel curved edges with constant band thickness', () => {
  const pose = getPose('happy');
  const curves = [];
  const context = {
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    quadraticCurveTo(...points) { curves.push(points); },
  };
  eyePath(context, pose.lw, pose.lh, pose.la);
  const top = curves[0];
  const bottom = curves[3];
  assert.ok(top[1] < top[3], 'the upper long edge must curve upward');
  assert.ok(bottom[1] < bottom[3], 'the lower long edge must also curve upward');
  const bezier = (a, b, c, t) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const upper = bezier(top[3], top[1], top[3], t);
    const lower = bezier(bottom[3], bottom[1], bottom[3], 1 - t);
    assert.ok(Math.abs(lower - upper - pose.lh) < 0.001);
  }
});

test('fullscreen eyes scale with the display and stay central with room for every expression', () => {
  const small = getLayout(1440, 900, true);
  const large = getLayout(2880, 1800, true);
  assert.equal(large.scale, small.scale * 2, 'fullscreen must not have a fixed size cap');
  assert.ok(360 * small.scale > 1440 * 0.5, 'eyes should dominate the fullscreen composition');
  for (const [width, height] of [[375, 812], [1440, 900], [1920, 1080], [3440, 1440], [1920, 600]]) {
    const layout = getLayout(width, height, true);
    assert.equal(layout.centerX, width / 2);
    assert.equal(layout.centerY, height / 2);
    for (const emotion of EMOTIONS) {
      const pose = getPose(emotion.id);
      for (const side of ['l', 'r']) {
        const horizontalExtent = Math.abs(pose[`${side}x`]) + pose[`${side}w`] / 2 + Math.abs(pose.gazeX) + 28 + 16;
        const verticalExtent = Math.abs(pose[`${side}y`]) + pose[`${side}h`] / 2 + pose[`${side}a`] + 19 + 16;
        assert.ok(horizontalExtent * layout.scale < width / 2, `${width}×${height}: ${emotion.id} fits horizontally`);
        assert.ok(verticalExtent * layout.scale < height / 2, `${width}×${height}: ${emotion.id} fits vertically`);
      }
    }
  }
});

test('catchlights follow attention and change character with emotion', () => {
  const pose = getPose('idle');
  const first = getLight(pose, 0);
  assert.ok(getLight({ ...pose, gazeX: 28 }, 0).x > first.x);
  assert.ok(getLight({ ...pose, gazeX: -28 }, 0).x < first.x);
  assert.ok(getLight({ ...pose, gazeY: -19 }, 0).y < first.y);
  assert.ok(getLight(getPose('happy'), 0).strength > first.strength);
  assert.ok(getLight(getPose('sleepy'), 0).strength < first.strength);
  assert.ok(getLight(getPose('focused'), 0).height < first.height);
  assert.ok(first.spread >= 0.4 && first.strength >= 0.3 && first.strength <= 0.35, 'the broad reflection has a balanced visible contrast');
  for (const emotion of EMOTIONS) for (let t = 0; t < 20; t += 0.1) {
    const light = getLight(getPose(emotion.id), t);
    assert.ok(Object.values(light).every(Number.isFinite));
    assert.ok(light.strength > 0 && light.strength <= 0.43);
    assert.ok(light.spread > 0);
    assert.ok(light.spread * light.height > 0.09 && light.spread * light.height < 0.45, 'surface light is broad without covering the whole eye');
  }
});

test('cursor mapping is centred, directional, smooth and bounded outside the canvas', () => {
  const rect = { left: 50, top: 100, width: 1000, height: 600 };
  const centre = getPointerGaze(550, 400, rect, true);
  assert.ok(Math.abs(centre.x) < 1e-8 && Math.abs(centre.y) < 1e-8);
  assert.ok(getPointerGaze(100, 400, rect, true).x < 0);
  assert.ok(getPointerGaze(1000, 400, rect, true).x > 0);
  assert.ok(getPointerGaze(550, 150, rect, true).y < 0);
  assert.ok(getPointerGaze(550, 650, rect, true).y > 0);
  const near = getPointerGaze(551, 401, rect, true);
  assert.ok(near.x > 0 && near.x < 0.15 && near.y > 0 && near.y < 0.15);
  for (const x of [-10000, 0, 500, 10000]) for (const y of [-10000, 0, 500, 10000]) {
    const point = getPointerGaze(x, y, rect, true);
    assert.ok(Math.abs(point.x) <= 40 && Math.abs(point.y) <= 28);
  }
});

test('attention subtly changes the near eye, spacing and eyelids without replacing the emotion', () => {
  const pose = getPose('idle');
  assert.deepEqual(getAttentionPose(pose, 0, 0), pose);
  const left = getAttentionPose(pose, -40, 0);
  const right = getAttentionPose(pose, 40, 0);
  assert.ok(left.lw > left.rw && left.lh > left.rh);
  assert.ok(right.rw > right.lw && right.rh > right.lh);
  assert.ok(right.rx - right.lx < pose.rx - pose.lx);
  assert.ok(getAttentionPose(pose, 0, -28).lh > pose.lh);
  assert.ok(getAttentionPose(pose, 0, 28).lh < pose.lh);
  for (const emotion of EMOTIONS) for (const x of [-40, 0, 40]) for (const y of [-28, 0, 28]) {
    const original = getPose(emotion.id);
    const directed = getAttentionPose(original, x, y);
    for (const dimension of ['lw', 'rw', 'lh', 'rh']) {
      assert.ok(directed[dimension] / original[dimension] > 0.88 && directed[dimension] / original[dimension] < 1.11);
    }
    assert.equal(directed.la, original.la);
    assert.equal(directed.ra, original.ra);
    assert.equal(directed.happy, original.happy);
    assert.equal(directed.thinking, original.thinking);
  }
});

test('highlights track clearly inside the eye while their full core remains on the surface', () => {
  const pose = getPose('idle');
  const left = getLight({ ...pose, gazeX: -40 }, 0);
  const right = getLight({ ...pose, gazeX: 40 }, 0);
  const up = getLight({ ...pose, gazeY: -28 }, 0);
  const down = getLight({ ...pose, gazeY: 28 }, 0);
  assert.ok(right.x - left.x >= 0.8);
  assert.ok(down.y - up.y >= 0.65);
  for (const emotion of EMOTIONS) for (const x of [-40, 40]) for (const y of [-28, 28]) for (const side of ['l', 'r']) {
    const light = getLight(getAttentionPose(getPose(emotion.id), x, y), 0, side);
    assert.ok(Math.abs(light.x) + light.spread <= 0.941);
    assert.ok(Math.abs(light.y) + light.height <= 0.941);
  }
});

test('attention poses fit the screen at all gaze extremes and expressions', () => {
  for (const [width, height] of [[375, 812], [1440, 900], [1920, 1080], [1920, 600]]) {
    const layout = getLayout(width, height, true);
    for (const emotion of EMOTIONS) for (const x of [-40, 40]) for (const y of [-28, 28]) {
      const pose = getAttentionPose(getPose(emotion.id), x, y);
      for (const side of ['l', 'r']) for (const px of [-pose[`${side}w`] / 2, pose[`${side}w`] / 2]) for (const py of [-pose[`${side}h`] / 2 - pose[`${side}a`], pose[`${side}h`] / 2]) {
        const angle = pose[`${side}r`];
        const ex = pose[`${side}x`] + Math.cos(angle) * px - Math.sin(angle) * py;
        const ey = pose[`${side}y`] + Math.sin(angle) * px + Math.cos(angle) * py;
        const screenX = layout.centerX + (Math.cos(pose.tilt) * ex - Math.sin(pose.tilt) * ey + pose.gazeX) * layout.scale;
        const screenY = layout.centerY + (Math.sin(pose.tilt) * ex + Math.cos(pose.tilt) * ey + pose.gazeY) * layout.scale;
        assert.ok(screenX > 0 && screenX < width && screenY > 0 && screenY < height, `${emotion.id} fits ${width}×${height}`);
      }
    }
  }
});

test('cursor attention overrides a thinking gaze and is followed by both eyes and surface light', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  try {
    const target = getPose('thinking');
    let rendered;
    const controller = Object.assign(Object.create(Eyes.prototype), {
      paused: false, autonomous: false, reducedMotion: { matches: false }, energy: 0,
      lastFrame: 0, elapsed: 0, lightTime: 0, emotionAt: 0, target, gaze: { until: 0 },
      lightGaze: { x: new Spring(0, 240, 32), y: new Spring(0, 240, 32) },
      attentionTarget: { x: 0, y: 0 }, attentionAt: -10,
      pointer: { active: true, x: -20, y: 12 }, follow: true, bounce: 0, blinkStart: -10,
      springs: Object.fromEntries(Object.entries(target).map(([key, value]) => [key, new Spring(value)])),
      draw(pose) { rendered = pose; },
    });
    for (let frame = 1; frame <= 180; frame++) controller.frame(frame * 1000 / 60);
    assert.ok(Math.abs(rendered.gazeX + 20) < 0.01);
    assert.ok(Math.abs(rendered.gazeY - 12) < 0.01);
    assert.ok(Math.abs(rendered.lightGazeX + 20) < 0.01);
    assert.ok(Math.abs(rendered.lightGazeY - 12) < 0.01);
  } finally {
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else delete globalThis.requestAnimationFrame;
  }
});

test('resting highlights never roam, rotate or morph, even during a long session', () => {
  const pose = getPose('idle');
  const first = getLight(pose, 0);
  for (const emotion of EMOTIONS) for (let t = 0; t <= 20000; t += 7.7) {
    const profile = getPose(emotion.id);
    const light = getLight(profile, t);
    const baseline = getLight(profile, 0);
    for (const key of ['x', 'y', 'spread', 'height']) {
      assert.equal(light[key], baseline[key], `${emotion.id}: ${key} is held at rest`);
    }
    assert.equal(light.angle, 0);
    const right = getLight(profile, t, 'r');
    assert.equal(light.x, right.x, 'both eyes share one attention target');
    assert.equal(light.y, right.y);
    assert.ok(Math.abs(light.strength - baseline.strength) < 0.013, 'idle brightness variation stays below two percent');
  }
  assert.equal(getLight({ ...pose, lightBreath: 0 }, 500).strength, first.strength);
});

test('expression profiles visibly shape surface light instead of only changing brightness', () => {
  const idle = getLight(getPose('idle'), 0);
  const happy = getLight(getPose('happy'), 0);
  const thinking = getLight(getPose('thinking'), 0);
  const focused = getLight(getPose('focused'), 0);
  const surprised = getLight(getPose('surprised'), 0);
  assert.ok(happy.spread > idle.spread && happy.height > idle.height);
  assert.ok(thinking.spread < idle.spread && thinking.y < idle.y && thinking.x > idle.x);
  assert.ok(focused.spread > idle.spread && focused.height < idle.height * 0.6);
  assert.ok(surprised.height > idle.height);
  const curious = getPose('curious');
  assert.ok(getLight(curious, 0, 'r').strength > getLight(curious, 0, 'l').strength);
});

test('the happy reflection bends along exactly the same surface as its eye', () => {
  const pose = getPose('happy');
  const light = getLight(pose, 0);
  const geometry = getLightGeometry(light, pose.lw, pose.lh, pose.la);
  assert.ok(geometry.bend > 0);
  for (let i = -4; i <= 4; i++) {
    const u = geometry.width * i / 10;
    const patchY = geometry.y + geometry.slope * u - geometry.bend * (1 - 4 * u ** 2 / geometry.width ** 2);
    const eyeX = geometry.x + u;
    const eyeY = light.y * pose.lh * 0.5 - pose.la * (1 - 4 * eyeX ** 2 / pose.lw ** 2);
    assert.ok(Math.abs(patchY - eyeY) < 1e-8);
  }
});

test('rendered surface light inherits the eye rotation without counter-rotation', () => {
  const angle = 0.23;
  let matrix = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
  const stack = [], points = [];
  const point = (x, y) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
  const context = {
    save() { stack.push([...matrix]); }, restore() { matrix = stack.pop(); },
    translate(x, y) { const p = point(x, y); matrix[4] = p[0]; matrix[5] = p[1]; },
    transform(a, b, c, d, e, f) {
      const m = matrix, p = point(e, f);
      matrix = [m[0]*a+m[2]*b, m[1]*a+m[3]*b, m[0]*c+m[2]*d, m[1]*c+m[3]*d, ...p];
    },
    rotate() { assert.fail('surface light must not cancel the eye rotation'); },
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect() {}, fill() {}, beginPath() {}, lineTo() {}, closePath() {},
    moveTo(x, y) { points.push(point(x, y)); },
    quadraticCurveTo(a, b, x, y) { points.push(point(x, y)); },
  };
  const pose = getPose('idle');
  Eyes.prototype.drawLight.call({ scale: 1, dpr: 1 }, context, pose, pose.lw, pose.lh, 0, 'l', 0, 0);
  const renderedAngle = Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]);
  assert.ok(Math.abs(renderedAngle - angle) < 1e-8);
});

test('attention accents have one gentle onset and settle instead of looping', () => {
  assert.equal(attentionEnvelope(-1), 0);
  assert.equal(attentionEnvelope(0), 0);
  assert.equal(attentionEnvelope(0.12), 1);
  assert.ok(attentionEnvelope(0.4) > 0 && attentionEnvelope(0.4) < 1);
  assert.equal(attentionEnvelope(0.68), 0);
  assert.equal(attentionEnvelope(100), 0);
  const pose = getPose('idle');
  const normal = getLight(pose, 0);
  const notice = getLight({ ...pose, attentionAccent: 1 }, 0);
  assert.equal(notice.angle, normal.angle);
  assert.equal(notice.x, normal.x);
  assert.ok(notice.strength > normal.strength && notice.strength - normal.strength < 0.05);
  assert.ok(notice.spread < normal.spread * 1.04);
});

test('ambient acting contains long holds and purposeful glances', () => {
  assert.deepEqual(getAmbientGaze('idle', 3), { x: 0, y: 0 });
  assert.ok(getAmbientGaze('idle', 6.8).x > 0);
  assert.equal(getAmbientGaze('idle', 8).x, 0);
  assert.equal(getAmbientGaze('thinking', 1).x, 0);
  assert.equal(getAmbientGaze('thinking', 2.8).x, -5);
  assert.equal(getAmbientGaze('thinking', 4).x, 0);
  for (let t = 0; t < 30; t += 0.1) assert.deepEqual(getAmbientGaze('focused', t), { x: 0, y: 0 });
});

test('attention highlights settle and reduced motion freezes their breath', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  try {
    const target = getPose('idle');
    const controller = Object.assign(Object.create(Eyes.prototype), {
      paused: false, autonomous: false, reducedMotion: { matches: false }, energy: 0.65,
      lastFrame: 0, elapsed: 0, lightTime: 0, emotionAt: 0, target, gaze: { until: 0 },
      lightGaze: { x: new Spring(0, 240, 32), y: new Spring(0, 240, 32) },
      attentionTarget: { x: 0, y: 0 }, attentionAt: -10,
      pointer: { active: false }, follow: false, bounce: 0, blinkStart: -10,
      springs: Object.fromEntries(Object.entries(target).map(([key, value]) => [key, new Spring(value)])),
      draw() {},
    });
    controller.frame(16.67);
    assert.ok(controller.lightTime > 0);
    assert.equal(controller.lightGaze.x.value, 0);
    assert.equal(controller.lightGaze.y.value, 0);
    const time = controller.lightTime;
    controller.reducedMotion.matches = true;
    controller.frame(33.34);
    assert.equal(controller.lightTime, time);
  } finally {
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else delete globalThis.requestAnimationFrame;
  }
});
