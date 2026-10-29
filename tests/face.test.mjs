import test from 'node:test';
import assert from 'node:assert/strict';
import {EyeSimulation, EXPRESSIONS, getLayout, getFaceMatrix, getFaceScreenMatrix} from '../eyes.js';

function project(m, x, y) {
  const w = m[12]*x + m[13]*y + 1;
  return {x:(m[0]*x+m[1]*y)/w, y:(m[4]*x+m[5]*y)/w, w};
}
function settle(sim, count=300) {
  for(let i=0;i<count;i++) sim.update(1/60);
  return sim.lastFrame;
}

test('the whole face uses real perspective: rightward gaze brings its left side forward', () => {
  const m=getFaceMatrix(.34,0,0), opposite=getFaceMatrix(-.34,0,0);
  assert.deepEqual(project(m,0,0), {x:0,y:0,w:1});
  const left=project(m,-112,40),right=project(m,112,40);
  assert.ok(left.y>40 && right.y<40, 'near side grows and far side recedes');
  assert.ok(Math.abs(left.x)>Math.abs(right.x), 'perspective changes spacing about the same pivot');
  assert.equal(left.y,project(opposite,112,40).y);
  assert.equal(left.x,-project(opposite,112,40).x);
  const pitch=getFaceMatrix(0,.24,0);
  assert.ok(project(pitch,100,80).x>project(pitch,100,-80).x);
});

test('perspective is identical in model and output coordinates at every layout size', () => {
  for(const [w,h] of [[375,812],[1440,900],[3440,600],[7680,4320]]) for(const immersive of [false,true]) {
    const layout=getLayout(w,h,immersive),face={matrix:getFaceMatrix(.34,-.24,.025)};
    const output=getFaceScreenMatrix(face,layout),sx=layout.scale,sy=sx*layout.stretchY;
    for(const [x,y] of [[-220,-100],[112,60],[210,130]]) {
      const model=project(face.matrix,x,y),screen=project(output,x*sx,y*sy);
      assert.ok(Math.abs(screen.x-model.x*sx)<1e-9);
      assert.ok(Math.abs(screen.y-model.y*sy)<1e-9);
    }
  }
});

test('gaze leads face rotation; interrupted turns stay continuous and settle without drift', () => {
  const sim=new EyeSimulation();sim.autonomous=false;
  settle(sim);sim.setPointer(40,-28,true);
  const early=settle(sim,6);
  assert.ok(early.pose.gazeX/40>early.face.yaw/.34+.1);
  for(const x of [-40,40,-40,0]) {
    const before=sim.lastFrame.face;
    sim.setPointer(x,0,true);
    assert.equal(sim.update(0).face.yaw,before.yaw,'a new target must not teleport the face');
    for(let i=0;i<180;i++) {
      const previous=sim.lastFrame.face,frame=sim.update(1/60);
      assert.ok(Math.abs(frame.face.yaw-previous.yaw)<.04);
      assert.ok(Math.abs(frame.face.pitch-previous.pitch)<.04);
    }
  }
  const held=settle(sim);
  assert.ok(Math.abs(held.face.yaw)<1e-7 && Math.abs(held.face.pitch)<1e-7);
  sim.paused=true;
  assert.equal(sim.update(60),held,'hidden/paused time must not advance the face');
});

test('all states, accessories and extreme gaze directions fit the same bounded face plane', () => {
  for(const {id} of EXPRESSIONS) for(const [x,y] of [[-40,-28],[40,28],[0,0]]) {
    const sim=new EyeSimulation({reducedMotion:true});sim.autonomous=false;
    sim.setEmotion(id);sim.setPointer(x,y,true);
    const frame=settle(sim);
    assert.ok(Math.abs(frame.face.yaw)<=.381 && Math.abs(frame.face.pitch)<=.281);
    for(const px of [-280,280]) for(const py of [-170,170]) {
      const p=project(frame.face.matrix,px,py);
      assert.ok(p.w>.8 && p.w<1.2, id+' must stay in front of the camera');
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    }
    const before=frame.face;
    settle(sim);
    assert.ok(Math.abs(sim.lastFrame.face.yaw-before.yaw)<1e-6);
    assert.ok(Math.abs(sim.lastFrame.face.pitch-before.pitch)<1e-6);
  }
});

test('the browser applies the same plane to Rive and Canvas without using transformed bounds', () => {
  const sim=new EyeSimulation({reducedMotion:true});sim.setEmotion('confused');settle(sim);
  sim.resize(1440,900,2,true);
  const canvas={style:{}};
  globalThis.EyesCore.applyFaceProjection(canvas,sim);
  const css=canvas.style.transform.slice(9,-1).split(',').map(Number);
  const screen=getFaceScreenMatrix(sim.lastFrame.face,sim.layout);
  for(let col=0;col<4;col++) for(let row=0;row<4;row++)
    assert.equal(css[col*4+row],screen[row*4+col]);
  assert.ok(canvas.style.transformOrigin.endsWith('px'));
});
