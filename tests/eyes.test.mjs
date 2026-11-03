import test from 'node:test';
import assert from 'node:assert/strict';
import { Spring, EyeSimulation, drawLight, getPose, blinkAmount, getLayout, getPointerGaze, getAttentionPose, getEyeGeometry, getEyeEdges, getSurfacePoint, rig, getLight, getLightGeometry, getLightFragments, eyePath, EMOTIONS, attentionEnvelope, getAmbientGaze, getFixationMotion, getExpressionAccent } from '../eyes.js';

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

test('a spring at rest is an exact fixed point and otherwise matches the plain integrator', () => {
  // Reference: the integrator without the rest shortcut.
  function reference(state, target, delta, stiffness, damping) {
    const duration = Math.max(0, Math.min(delta, 0.064));
    const steps = Math.max(1, Math.ceil(duration / (1 / 240)));
    const dt = duration / steps;
    for (let i = 0; i < steps; i++) {
      state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * dt;
      state.value += state.velocity * dt;
    }
  }
  const rested = new Spring(7.25);
  for (let i = 0; i < 100; i++) assert.equal(rested.step(7.25, 1 / 60), 7.25);
  assert.equal(rested.velocity, 0);

  const spring = new Spring(0, 150, 25);
  const plain = {value: 0, velocity: 0};
  const targets = [0, 1, 1, 0.35, 0, 0, -0.6, -0.6, 0];
  let worst = 0;
  for (const target of targets) {
    for (let i = 0; i < 400; i++) {
      spring.step(target, 1 / 60);
      reference(plain, target, 1 / 60, 150, 25);
      worst = Math.max(worst, Math.abs(spring.value - plain.value));
    }
  }
  assert.ok(worst < 1e-8, `rest shortcut drifted by ${worst}`);
  // A decaying tail settles exactly instead of integrating for ever.
  assert.equal(spring.value, 0);
  assert.equal(spring.velocity, 0);
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

test('happy eyes trace parallel spline edges with constant band thickness', () => {
  const pose = getPose('happy');
  for (const gazeX of [-40, 0, 40]) for (const gazeY of [-28, 0, 28]) {
    const directed = getAttentionPose(pose, gazeX, gazeY);
    for (const side of ['l', 'r']) for (const blink of [0, 0.5, 1]) {
      const eye = getEyeGeometry(directed, side, blink, 0);
      const curves = [];
      eyePath({beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
        bezierCurveTo(...points) { curves.push(points); }}, eye);
      assert.equal(curves.length, 8, 'four exact cubic segments per lid');
      for (let i = 0; i <= 100; i++) {
        const edge = getEyeEdges(eye, i / 50 - 1);
        assert.ok(Math.abs(edge.lower - edge.upper - eye.height) < 1e-8);
      }
    }
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
    assert.equal(layout.centerY, height * 0.43);
    assert.ok(layout.stretchY > 1.2, 'fullscreen eyes should be elongated');
    for (const emotion of EMOTIONS) {
      const pose = getPose(emotion.id);
      for (const side of ['l', 'r']) {
        const horizontalExtent = Math.abs(pose[`${side}x`]) + pose[`${side}w`] / 2 + Math.abs(pose.gazeX) + 28 + 16;
        const upperBend = Math.abs(pose[`${side}a`] + pose[`${side}uc`]);
        const lowerBend = Math.abs(pose[`${side}a`] + pose[`${side}lc`]);
        const verticalExtent = Math.abs(pose[`${side}y`]) + pose[`${side}h`] / 2 +
          Math.max(upperBend, lowerBend) + 19 + 16;
        assert.ok(horizontalExtent * layout.scale < width / 2, `${width}×${height}: ${emotion.id} fits horizontally`);
        assert.ok(verticalExtent * layout.scale * layout.stretchY < Math.min(layout.centerY, height - layout.centerY), `${width}×${height}: ${emotion.id} fits vertically`);
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
  assert.ok(first.spread >= 0.6 && first.height >= 0.5 && first.strength >= 0.1 && first.strength <= 0.2,
    'a broad diffuse reflection must stay subordinate to the silhouette');
  for (const emotion of EMOTIONS) for (let t = 0; t < 20; t += 0.1) {
    const light = getLight(getPose(emotion.id), t);
    assert.ok(Object.values(light).every(Number.isFinite));
    assert.ok(light.strength > 0 && light.strength <= 0.24);
    assert.ok(light.spread > 0);
    assert.ok(light.spread * light.height > 0.09 && light.spread * light.height < 0.5, 'surface light is broad without covering the whole eye');
  }
});

test('cursor mapping is centred, directional, smooth and bounded outside the canvas', () => {
  const rect = { left: 50, top: 100, width: 1000, height: 600 };
  const centerY = rect.top + getLayout(rect.width, rect.height, true).centerY;
  const centre = getPointerGaze(550, centerY, rect, true);
  assert.ok(Math.abs(centre.x) < 1e-8 && Math.abs(centre.y) < 1e-8);
  assert.ok(getPointerGaze(100, 400, rect, true).x < 0);
  assert.ok(getPointerGaze(1000, 400, rect, true).x > 0);
  assert.ok(getPointerGaze(550, 150, rect, true).y < 0);
  assert.ok(getPointerGaze(550, 650, rect, true).y > 0);
  const near = getPointerGaze(551, centerY + 1, rect, true);
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
  assert.ok(right.x - left.x >= 0.5, 'a broad material reflection follows the target without acting like a pupil');
  assert.ok(down.y - up.y >= 0.55, 'the taller patch must retain useful vertical travel with room for its edges');
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
      for (const side of ['l', 'r']) for (const px of [-pose[`${side}w`] / 2, 0, pose[`${side}w`] / 2]) for (const edge of [-1, 1]) {
        const u = 2 * px / pose[`${side}w`];
        const edges = getEyeEdges(getEyeGeometry(pose, side, 0, 0), u);
        const py = edge < 0 ? edges.upper : edges.lower;
        const angle = pose[`${side}r`];
        const ex = pose[`${side}x`] + Math.cos(angle) * px - Math.sin(angle) * py;
        const ey = pose[`${side}y`] + Math.sin(angle) * px + Math.cos(angle) * py;
        const screenX = layout.centerX + (Math.cos(pose.tilt) * ex - Math.sin(pose.tilt) * ey + pose.gazeX) * layout.scale;
        const screenY = layout.centerY + (Math.sin(pose.tilt) * ex + Math.cos(pose.tilt) * ey + pose.gazeY * layout.gazeScaleY) * layout.scale * layout.stretchY;
        assert.ok(screenX > 0 && screenX < width && screenY > 0 && screenY < height, `${emotion.id} fits ${width}×${height}`);
      }
    }
  }
});

test('cursor attention overrides a thinking gaze and is followed by both eyes and surface light', () => {
  const controller = new EyeSimulation();
  controller.autonomous = false;
  controller.energy = 0;
  controller.setEmotion('thinking');
  controller.setPointer(-20, 12, true);
  for (let frame = 1; frame <= 180; frame++) controller.update(1 / 60);
  const rendered = controller.lastFrame.pose;
  assert.ok(Math.abs(rendered.gazeX + 20) < 0.01);
  assert.ok(Math.abs(rendered.gazeY - 12) < 0.01);
  assert.ok(Math.abs(rendered.lightGazeX + 20) < 0.01);
  assert.ok(Math.abs(rendered.lightGazeY - 12) < 0.01);
});

test('resting main highlights never roam, rotate or morph, even during a long session', () => {
  const pose = getPose('idle');
  const first = getLight(pose, 0);
  for (const emotion of EMOTIONS) for (let t = 0; t <= 20000; t += 7.7) {
    const profile = getPose(emotion.id);
    const light = getLight(profile, t);
    const baseline = getLight(profile, 0);
    for (const key of ['x', 'y', 'spread', 'height']) {
      assert.equal(light[key], baseline[key], `${emotion.id}: ${key} is held at rest`);
    }
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
  assert.ok(happy.spread > idle.spread && happy.height < idle.height,
    'the smile uses a long reflection stretched along its slim curved band');
  assert.ok(thinking.spread < idle.spread && thinking.y < idle.y && thinking.x > idle.x);
  assert.ok(focused.spread > idle.spread && focused.height < idle.height * 0.75);
  assert.ok(surprised.height > idle.height);
  const curious = getPose('curious');
  assert.ok(getLight(curious, 0, 'r').strength > getLight(curious, 0, 'l').strength);
});

test('surface light anchors and tangents follow every part of the spline rig', () => {
  for (const {id} of EMOTIONS) {
    const eye = getEyeGeometry(getPose(id), 'l', 0, 0);
    for (const u of [-0.8, -0.3, 0, 0.4, 0.8]) {
      const light = {...getLight(getPose(id), 0), x: u};
      const geometry = getLightGeometry(light, eye);
      const center = getSurfacePoint(eye, u, light.y);
      const epsilon = 1e-5;
      const tangent = (getSurfacePoint(eye, u + epsilon, light.y).y -
        getSurfacePoint(eye, u - epsilon, light.y).y) / (epsilon * eye.width);
      assert.ok(Math.abs(geometry.x - center.x) < 1e-8);
      assert.ok(Math.abs(geometry.y - center.y) < 1e-8);
      assert.ok(Math.abs(geometry.slope - tangent) < 1e-5);
    }
  }
});

test('rendered light inherits eye rotation and never redraws a smaller eye', () => {
  const angle = 0.23;
  let matrix = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
  const stack = [], strips = [];
  const point = (x, y) => [matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]];
  const context = {
    save() { stack.push([...matrix]); }, restore() { matrix = stack.pop(); },
    translate(x, y) { const p = point(x, y); matrix[4] = p[0]; matrix[5] = p[1]; },
    transform(a, b, c, d, e, f) {
      const m = matrix, p = point(e, f);
      matrix = [m[0]*a+m[2]*b, m[1]*a+m[3]*b, m[0]*c+m[2]*d, m[1]*c+m[3]*d, ...p];
    },
    rotate() { assert.fail('surface light must inherit the parent rotation'); },
    beginPath() { assert.fail('a reflection must not trace a second eye contour'); },
    createLinearGradient() { return {addColorStop() {}}; },
    fillRect() { strips.push([...matrix]); },
  };
  const pose = getPose('happy');
  drawLight(context, {scale: 1, dpr: 1, flowTime: 3}, pose,
    getEyeGeometry(pose, 'l', 0, 0), 'l', 0, 0);
  assert.ok(strips.length > 40);
  for (const m of strips) {
    assert.ok(m.every(Number.isFinite));
    assert.ok(Math.abs(Math.atan2(m[3], m[2]) - angle - Math.PI / 2) < 1e-8);
  }
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
  assert.equal(notice.x, normal.x);
  assert.ok(notice.strength > normal.strength && notice.strength - normal.strength < 0.05);
  assert.ok(notice.spread < normal.spread * 1.04);
});

test('ambient acting contains long holds and purposeful glances', () => {
  assert.deepEqual(getAmbientGaze('idle', 3), { x: 0, y: 0 });
  const right = getAmbientGaze('idle', 4.6);
  assert.deepEqual(getAmbientGaze('idle', 5.4), right);
  assert.ok(right.x > 6 && right.y < -1, 'idle holds a small right-up glance');
  assert.equal(getAmbientGaze('idle', 8).x, 0);
  assert.ok(getAmbientGaze('idle', 11.6).x < -4, 'a second glance answers to the left');
  assert.equal(getAmbientGaze('thinking', 1).x, 0);
  assert.ok(getAmbientGaze('thinking', 3.1).x < -4);
  assert.equal(getAmbientGaze('thinking', 6).x, 0);
  assert.ok(getAmbientGaze('curious', 1.8).x > 3);
  assert.ok(getAmbientGaze('curious', 6.8).x < -2);
  assert.ok(getAmbientGaze('confused', 2.2).x < -3);
  assert.ok(getAmbientGaze('confused', 7.8).x > 3);
  for (let t = 0; t < 30; t += 0.1) assert.deepEqual(getAmbientGaze('focused', t), { x: 0, y: 0 });
});

test('attention highlights settle and reduced motion freezes their breath', () => {
  const controller = new EyeSimulation();
  controller.autonomous = false;
  controller.follow = false;
  controller.update(1 / 60);
  assert.ok(controller.lightTime > 0);
  assert.equal(controller.lightGaze.x.value, 0);
  assert.equal(controller.lightGaze.y.value, 0);
  const time = controller.lightTime;
  controller.reducedMotion = true;
  controller.update(1 / 60);
  assert.equal(controller.lightTime, time);
});

test('secondary reflections stay quiet, inside the eye, and fade through wraparound', () => {
  for (const emotion of EMOTIONS) for (const side of ['l', 'r']) {
    const pose = getAttentionPose(getPose(emotion.id), 40, -28);
    let previous;
    for (let step = 0; step <= 900; step++) {
      const fragments = getLightFragments(pose, step / 60, side);
      assert.equal(fragments.length, 2);
      for (let i = 0; i < fragments.length; ++i) {
        const light = fragments[i];
        assert.ok(Object.values(light).every(Number.isFinite));
        assert.ok(light.strength >= 0 && light.strength < 0.03);
        assert.ok(light.spread * light.height <= 0.031);
        assert.ok(Math.abs(light.x) + light.spread < 0.94);
        assert.ok(Math.abs(light.y) + light.height < 0.94);
        if (previous) {
          assert.ok(Math.abs(light.strength - previous[i].strength) < 0.001);
          assert.ok(Math.abs(light.x * light.strength - previous[i].x * previous[i].strength) < 0.001,
            'a hidden loop reset must not produce a visible jump');
        }
      }
      previous = fragments;
    }
  }
});

test('secondary light flow pauses for reduced motion and disabled natural actions', () => {
  const simulation = new EyeSimulation();
  simulation.update(0.05);
  assert.ok(simulation.flowTime > 0);
  const before = simulation.flowTime;
  simulation.reducedMotion = true;
  simulation.update(0.05);
  assert.equal(simulation.flowTime, before);
  simulation.reducedMotion = false;
  simulation.autonomous = false;
  simulation.update(0.05);
  assert.equal(simulation.flowTime, before);
});

test('16:10 desktop composition stays above the lower half even when looking down', () => {
  for (const [width, height] of [[1600, 1000], [2240, 1400]]) {
    const layout = getLayout(width, height, true);
    const restingHeight = getPose('idle').lh * layout.scale * layout.stretchY;
    assert.ok(restingHeight > height * 0.43 && restingHeight < height * 0.48);
    const lowestCenter = layout.centerY + 28 * layout.scale * layout.stretchY * layout.gazeScaleY;
    assert.ok(lowestCenter < height * 0.5);
  }
});

test('blinks close mainly from the upper lid without stretching the eye sideways', () => {
  for (const emotion of EMOTIONS) for (const side of ['l', 'r']) {
    const pose = getPose(emotion.id);
    const open = getEyeGeometry(pose, side, 0, 0);
    const closed = getEyeGeometry(pose, side, 1, 0);
    const upperTravel = closed.offsetY - closed.height / 2 + open.height / 2;
    const lowerTravel = open.height / 2 - closed.offsetY - closed.height / 2;
    assert.ok(upperTravel > lowerTravel * 2 && lowerTravel > 0);
    assert.ok(closed.width / open.width <= 1.026);
    assert.ok(closed.height < open.height * 0.05);
    assert.deepEqual(getEyeGeometry(pose, side, 0, 0), open);
  }
  for (const boundary of [0, 0.085, 0.12, 0.32, 0.39, 0.475, 0.51, 0.71]) {
    const epsilon = 0.00001;
    assert.ok(Math.abs(blinkAmount(boundary + epsilon, true) - blinkAmount(boundary - epsilon, true)) < 0.00001,
      'eyelid velocity settles at the open and closed holds');
  }
});

test('sleepy blinks linger while focused blinks reopen promptly and occur less often', () => {
  const samples = {};
  for (const emotion of ['idle', 'sleepy', 'focused']) {
    const simulation = new EyeSimulation({ random: () => 0.5 });
    simulation.autonomous = false;
    simulation.setEmotion(emotion);
    simulation.blink();
    for (let i = 0; i < 24; i++) simulation.update(1 / 60);
    samples[emotion] = { blink: simulation.lastFrame.blink, next: simulation.nextBlink };
  }
  assert.equal(samples.idle.blink, 0);
  assert.equal(samples.focused.blink, 0);
  assert.ok(samples.sleepy.blink > 0.2);
  assert.ok(samples.focused.next > samples.idle.next + 1.5);
});

test('fixation corrections have quiet holds, bounded amplitude and no visible loop reset', () => {
  let still = 0;
  let previous = getFixationMotion('idle', 0);
  for (let i = 0; i < 2970; i++) {
    const motion = getFixationMotion('idle', i / 100);
    if (motion.x === 0 && motion.y === 0 && motion.lid === 0) still++;
    assert.ok(Math.abs(motion.x) < 1.45 && Math.abs(motion.y) < 0.56);
    assert.ok(motion.lid >= 0 && motion.lid <= 0.04);
    assert.ok(Math.abs(motion.x - previous.x) < 0.28);
    previous = motion;
  }
  assert.ok(still > 2400, 'most of the time is spent holding a fixation');
  assert.deepEqual(getFixationMotion('idle', 29.7), getFixationMotion('idle', 0));
  assert.ok(getFixationMotion('focused', 3).x < getFixationMotion('idle', 3).x / 3);
});

test('a still cursor retains its target and anchored main reflection through natural micro acting', () => {
  for (const fps of [30, 60, 144]) {
    const simulation = new EyeSimulation({ random: () => 0.5 });
    simulation.setPointer(23, -12, true);
    let min = Infinity, max = -Infinity;
    let reference;
    for (let i = 0; i < fps * 35; i++) {
      const frame = simulation.update(1 / fps);
      if (i < fps * 2) continue;
      min = Math.min(min, frame.pose.gazeX);
      max = Math.max(max, frame.pose.gazeX);
      assert.ok(Math.abs(frame.pose.gazeX - 23) < 1);
      assert.ok(Math.abs(frame.pose.gazeY + 12) < 0.6);
      const light = getLight(frame.pose, simulation.lightTime);
      reference ||= light;
      for (const key of ['x', 'y', 'spread', 'height']) {
        assert.ok(Math.abs(light[key] - reference[key]) < 0.0001, `${key}: the main patch must stay anchored`);
      }
    }
    assert.ok(max - min > 1.4, 'the gaze is alive even while holding the same target');
  }
});

test('expression accents resolve once and repeated harness states do not restart the performance', () => {
  assert.ok(getExpressionAccent('surprised', 0.25).open > 0);
  assert.ok(getExpressionAccent('happy', 0.25).bend > 0);
  assert.ok(getExpressionAccent('curious', 0.4).asymmetry > 0);
  assert.ok(getExpressionAccent('confused', 0.6).tilt < 0);
  for (const emotion of EMOTIONS) {
    assert.ok(Object.values(getExpressionAccent(emotion.id, 3)).every(value => value === 0));
    const simulation = new EyeSimulation({ random: () => 0.5 });
    simulation.setEmotion(emotion.id);
    for (let i = 0; i < 240; i++) simulation.update(1 / 60);
    const emotionAt = simulation.emotionAt;
    const bounce = simulation.bounce;
    simulation.setEmotion(emotion.id);
    assert.equal(simulation.emotionAt, emotionAt);
    assert.equal(simulation.bounce, bounce);
  }
});

test('gaze arrives before eyelid orientation and surface light, all settling on one target', () => {
  const simulation = new EyeSimulation();
  simulation.autonomous = false;
  simulation.setPointer(40, -20, true);
  for (let i = 0; i < 6; i++) simulation.update(1 / 60);
  const pose = simulation.lastFrame.pose;
  assert.ok(pose.gazeX > pose.lightGazeX);
  assert.ok(pose.gazeX / 40 > pose.tilt / getAttentionPose(getPose('idle'), 40, -20).tilt);
  for (let i = 0; i < 240; i++) simulation.update(1 / 60);
  assert.ok(Math.abs(simulation.lastFrame.pose.lightGazeX - 40) < 0.001);
});

test('natural motion pauses without advancing its phase and reduced motion removes spontaneous acting', () => {
  const simulation = new EyeSimulation({ random: () => 0.5 });
  for (let i = 0; i < 180; i++) simulation.update(1 / 60);
  const phase = simulation.flowTime;
  const nextBlink = simulation.nextBlink;
  simulation.autonomous = false;
  for (let i = 0; i < 600; i++) simulation.update(1 / 60);
  assert.equal(simulation.flowTime, phase);
  assert.equal(simulation.lastFrame.breathe, 0);
  assert.ok(Math.abs(simulation.lastFrame.pose.gazeX) < 0.001);
  simulation.autonomous = true;
  simulation.update(1 / 60);
  assert.ok(Math.abs(simulation.flowTime - phase - 1 / 60) < 1e-10);
  assert.equal(simulation.nextBlink, nextBlink, 'resuming must not force an overdue automatic blink');
  simulation.reducedMotion = true;
  simulation.setEmotion('surprised');
  for (let i = 0; i < 300; i++) simulation.update(1 / 60);
  assert.equal(simulation.lastFrame.breathe, 0);
  assert.equal(simulation.lastFrame.bounce, 0);
  assert.equal(simulation.lastFrame.blink, 0);
  assert.ok(Math.abs(simulation.lastFrame.pose.lh - getPose('surprised').lh) < 0.001);
});

test('live expression changes stay finite and fit extreme displays throughout blinks and onset accents', () => {
  for (const fps of [30, 60, 144]) for (const [gazeX, gazeY] of [[-40, -28], [40, -28], [-40, 28], [40, 28]]) {
    const simulation = new EyeSimulation({ random: () => 0.5 });
    simulation.energy = 1;
    for (const emotion of EMOTIONS) {
      simulation.setEmotion(emotion.id);
      simulation.setPointer(gazeX, gazeY, true);
      for (let i = 0; i < fps * 3; i++) {
        const frame = simulation.update(1 / fps);
        assert.ok(Object.values(frame.pose).every(Number.isFinite));
        for (const side of ['l', 'r']) {
          const eye = getEyeGeometry(frame.pose, side, frame.blink, frame.breathe);
          assert.ok(eye.width > 0 && eye.height > 0 &&
            Number.isFinite(eye.upperBend) && Number.isFinite(eye.lowerBend));
          for (const [width, height] of [[375, 812], [1920, 600], [5120, 1440]]) {
            const layout = getLayout(width, height, true);
            for (const px of [-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5].map(x => x * eye.width)) for (const edge of [-1, 1]) {
              const u = 2 * px / eye.width;
              const edges = getEyeEdges(eye, u);
              const py = edge < 0 ? edges.upper : edges.lower;
              const p = frame.pose, angle = p[side + 'r'];
              const ex = p[side + 'x'] + Math.cos(angle) * px - Math.sin(angle) * py;
              const ey = p[side + 'y'] + eye.offsetY + Math.sin(angle) * px + Math.cos(angle) * py;
              const sx = ex * (1 + frame.bounce), sy = ey * (1 - frame.bounce);
              const x = layout.centerX + (Math.cos(p.tilt) * sx - Math.sin(p.tilt) * sy + p.gazeX) * layout.scale;
              const y = layout.centerY + (Math.sin(p.tilt) * sx + Math.cos(p.tilt) * sy + p.gazeY * layout.gazeScaleY) * layout.scale * layout.stretchY;
              assert.ok(x > 0 && x < width && y > 0 && y < height, `${emotion.id}: live pose fits ${width}×${height} at ${fps}fps`);
            }
          }
        }
      }
    }
  }
});

test('each emotion has a distinct eyelid cue without skewing the entire eye blocks', () => {
  const poses = Object.fromEntries(EMOTIONS.map(({id}) => [id, getPose(id)]));
  for (const pose of Object.values(poses)) {
    assert.ok(Math.abs(pose.lr) < 0.025 && Math.abs(pose.rr) < 0.025);
    assert.ok(Math.abs(pose.tilt) < 0.03);
    assert.ok(Math.max(pose.lw, pose.rw) / Math.min(pose.lw, pose.rw) < 1.1);
  }
  assert.ok(poses.idle.luc > 0 && poses.idle.llc < 0 && poses.idle.lu !== 0,
    'idle uses relaxed, unequal lid tension instead of a flat square');
  assert.ok(poses.happy.la > 15 && poses.happy.lh / poses.happy.lw < 0.24);
  assert.equal(poses.happy.la + poses.happy.luc, poses.happy.la + poses.happy.llc,
    'the happy eye keeps both long edges parallel');
  assert.ok(poses.curious.rh > poses.curious.lh * 1.25 && poses.curious.ruc > poses.curious.luc);
  assert.ok(poses.thinking.gazeY < -8 && poses.thinking.lh < poses.thinking.rh &&
    poses.thinking.luc < 0 && poses.thinking.rlc < 0);
  assert.ok(poses.focused.lu > 0 && poses.focused.lu <= 15 && poses.focused.ru === -poses.focused.lu &&
    poses.focused.luc < 0 && poses.focused.rlc > 0,
    'focused lids tighten inward without a steep angry diagonal');
  assert.ok(poses.surprised.lw * poses.surprised.lh > poses.idle.lw * poses.idle.lh * 1.2 &&
    poses.surprised.luc > 7 && poses.surprised.rlc < -6);
  assert.ok(poses.sleepy.lh < poses.idle.lh * 0.25 && poses.sleepy.la === 0 &&
    poses.sleepy.luc < 0 && poses.sleepy.rlc > 0);
  assert.ok(poses.confused.lh > poses.confused.rh * 1.3 &&
    poses.confused.llc < 0 && poses.confused.ruc < 0 && poses.confused.rlc > 0);
});

test('spline eyelids never cross and all reflection cores remain on the curved surface', () => {
  for (const {id} of EMOTIONS) for (const gazeX of [-40, 40]) for (const gazeY of [-28, 28]) {
    const pose = getAttentionPose(getPose(id), gazeX, gazeY);
    for (const side of ['l', 'r']) for (const blink of [0, 0.5, 1]) {
      const eye = getEyeGeometry(pose, side, blink, 0);
      for (let i = 0; i <= 200; ++i) {
        const edge = getEyeEdges(eye, i / 100 - 1);
        assert.ok(edge.lower > edge.upper, `${id}: lids must not cross`);
      }
      for (const light of [getLight(pose, 0, side), ...getLightFragments(pose, 3, side)]) {
        for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
          const u = light.x + light.spread * x;
          const v = light.y + light.height * y;
          assert.ok(Math.abs(u) < 1 && Math.abs(v) < 1);
          const point = getSurfacePoint(eye, u, v);
          const edge = getEyeEdges(eye, u);
          assert.ok(point.y > edge.upper && point.y < edge.lower);
        }
      }
    }
  }
});

test('resting eyelid acting is visible at default energy while attention stays on a still target', () => {
  const samples = {};
  for (const emotion of EMOTIONS.map(({id}) => id)) {
    const simulation = new EyeSimulation({random: () => 0.5});
    simulation.setEmotion(emotion);
    simulation.setPointer(10, -6, true);
    const baseline = getAttentionPose(getPose(emotion), 10, -6);
    const heights = [], tilts = [], upperBends = [], sharedBends = [];
    for (let i = 0; i < 12.6 * 60; i++) {
      const pose = simulation.update(1 / 60).pose;
      if (i < 90) continue;
      heights.push(pose.rh / baseline.rh);
      tilts.push(pose.tilt);
      upperBends.push(pose.ruc);
      sharedBends.push(pose.ra);
      assert.ok(Math.abs(pose.gazeX - 10) < 1);
    }
    samples[emotion] = {
      opening: Math.max(...heights) - Math.min(...heights),
      tilt: Math.max(...tilts) - Math.min(...tilts),
      upperBend: Math.max(...upperBends) - Math.min(...upperBends),
      sharedBend: Math.max(...sharedBends) - Math.min(...sharedBends),
    };
  }
  assert.ok(samples.idle.opening > 0.11 && samples.idle.opening < 0.145,
    'resting eyelids should move without changing the expression into another pose');
  assert.ok(samples.idle.upperBend > 1.4, 'the upper and lower lids should flex independently');
  assert.ok(samples.curious.tilt > 0.008 && samples.curious.tilt < 0.018,
    'curiosity should lean gently instead of skewing the eye blocks');
  assert.ok(samples.confused.tilt > 0.008 && samples.confused.tilt < 0.018);
  assert.ok(samples.happy.sharedBend > 3.8 && samples.happy.sharedBend < 5);
  assert.ok(samples.focused.opening < samples.idle.opening / 3, 'focus retains its steady acting');
});

test('idle breathing stays continuous, visible and distinct across three calm cycles', () => {
  const core = globalThis.EyesCore;
  const duration = core.getPerformanceDuration('idle');
  const simulation = new EyeSimulation({ random: () => 0.5 });
  simulation.follow = false;
  const heights = [], widths = [], centres = [];
  let maxStep = 0, previous;
  for (let i = 0; i < (duration + 1) * 60; i++) {
    const pose = simulation.update(1 / 60).pose;
    if (i < 120) continue;
    const geometry = getEyeGeometry(pose, 'r', 0, 0);
    heights.push(geometry.height);
    widths.push(geometry.width);
    centres.push(pose.ry);
    if (previous !== undefined) maxStep = Math.max(maxStep, Math.abs(geometry.height - previous));
    previous = geometry.height;
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 15,
    'the default idle breath visibly changes eyelid opening');
  assert.ok(Math.max(...widths) - Math.min(...widths) > 1.4,
    'the breath widens and narrows the eye body rather than only bobbing vertically');
  assert.ok(Math.max(...centres) - Math.min(...centres) > 6,
    'the eye centre rises and settles with the breath');
  assert.ok(maxStep < 0.25, 'continuous springs cannot introduce a one-frame eyelid jump');
  let peaks = 0;
  for (let i = 2; i < heights.length - 2; i++) {
    if (heights[i] > heights[i - 2] && heights[i] > heights[i + 2] &&
        heights[i] > getPose('idle').rh * 1.02) peaks++;
  }
  // A peak is counted once per plateau; adjacent samples can share the same
  // rounded maximum, so require repeated visible breaths rather than exactly 3.
  assert.ok(peaks >= 3, 'three calm breaths replace the old isolated idle beats');
});
