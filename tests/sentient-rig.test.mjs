import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {getPose, getEyeGeometry, getEyeEdges, EyeSimulation, EMOTIONS, rig} from '../eyes.js';

test('the JavaScript kernel matches the pinned upstream Python spline', () => {
  const cases = [];
  for (const points of [[0, 2, -4, 9], [12, -6, -2, 3], [-40, -40, -60, -25]]) {
    for (let i = 0; i <= 20; ++i) cases.push([...points, i / 20]);
  }
  const script = `import ast, json, pathlib, sys
source = pathlib.Path('vendor/sentient-eye-engine/upstream/face_renderer.py').read_text()
function = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'catmull_rom_spline')
namespace = {}
exec(compile(ast.Module(body=[function], type_ignores=[]), 'upstream-spline', 'exec'), namespace)
print(json.dumps([namespace['catmull_rom_spline'](*case) for case in json.load(sys.stdin)]))`;
  const expected = JSON.parse(execFileSync('python3', ['-c', script], {
    input: JSON.stringify(cases), encoding: 'utf8',
  }));
  for (let i = 0; i < cases.length; ++i) {
    const kernel = globalThis.SentientEyeRig;
    const values = cases[i];
    assert.ok(Math.abs(kernel.catmullRom(...values) - expected[i]) < 1e-10);
    const curves = kernel.compile([...values.slice(0, 4), 0]);
    assert.ok(Math.abs(kernel.sample(curves, (values[4] - 1) / 2) - expected[i]) < 1e-10,
      'the coefficients consumed by both renderers must also match upstream');
  }
  assert.equal(rig.name, 'Sentient Eye Engine');
  assert.equal(rig.revision, '42761191371f328361b62b5cfd095aac3f58c33d');
});

test('the QML bundle and browser module produce the same spline coefficients', () => {
  const context = vm.createContext({});
  const source = readFileSync('vendor/sentient-eye-engine/rig.js', 'utf8') + '\n' +
    readFileSync('eyes-core.js', 'utf8');
  vm.runInContext(source, context);
  for (const {id} of EMOTIONS) for (const side of ['l', 'r']) for (const blink of [0, 0.4, 1]) {
    const browser = getEyeGeometry(getPose(id), side, blink, 0);
    const qml = context.EyesCore.getEyeGeometry(context.EyesCore.getPose(id), side, blink, 0);
    assert.equal(JSON.stringify(qml), JSON.stringify(browser));
  }
});

test('product lids preserve tangents and curvature across every internal knot', () => {
  for (const {id} of EMOTIONS) for (const side of ['l', 'r']) for (const blink of [0, .5, 1]) {
    const eye = getEyeGeometry(getPose(id), side, blink, 0);
    for (const lid of [eye.upper, eye.lower]) for (let i = 0; i < 3; i++) {
      const a = lid[i], b = lid[i + 1];
      assert.ok(Math.abs(a[0] + a[1] + a[2] + a[3] - b[0]) < 1e-9, id);
      assert.ok(Math.abs(a[1] + 2*a[2] + 3*a[3] - b[1]) < 1e-9, id+' tangent');
      assert.ok(Math.abs(2*a[2] + 6*a[3] - 2*b[2]) < 1e-9, id+' curvature');
    }
  }
});

test('the smile has one convex arc without reversed shoulder curvature', () => {
  const eye = getEyeGeometry(getPose('happy'), 'l', 0, 0);
  for (const lid of [eye.upper, eye.lower]) for (const c of lid)
    for (let t = 0; t <= 1; t += .05)
      assert.ok(2*c[2] + 6*c[3]*t > 0, 'a smile must not form an S curve near its ends');
  for (let u = -1; u <= 1; u += .01) {
    const edge = getEyeEdges(eye, u);
    assert.ok(Math.abs(edge.lower-edge.upper-eye.height) < 1e-9);
  }
});

test('every morph preserves separated lids through blinking and local control-point motion', () => {
  for (const from of EMOTIONS) for (const to of EMOTIONS) {
    const engine = new EyeSimulation({random: () => 0.5});
    engine.energy = 1;
    engine.autonomous = false;
    engine.setEmotion(from.id);
    for (let i = 0; i < 240; ++i) engine.update(1 / 60);
    engine.autonomous = true;
    engine.setPointer(40, -28, true);
    engine.setEmotion(to.id);
    for (let i = 0; i < 180; ++i) {
      if (i === 14) engine.blink(true);
      const frame = engine.update(1 / 60);
      for (const side of ['l', 'r']) {
        const eye = getEyeGeometry(frame.pose, side, frame.blink, frame.breathe);
        for (let u = -1; u <= 1; u += 0.025) {
          const edges = getEyeEdges(eye, u);
          assert.ok(edges.lower > edges.upper, `${from.id} → ${to.id}: ${side} lids cross`);
        }
      }
    }
  }
});
