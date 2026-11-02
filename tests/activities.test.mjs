import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIVITIES, EXPRESSIONS, EyeSimulation, getPose, getEyeGeometry, getEyeEdges, getAttentionPose, getLayout} from '../eyes.js';

const core = globalThis.EyesCore;

test('activity performances retain clear, finite, nonintersecting lids during every gesture and attention extreme', () => {
  const keys = Object.keys(getPose('idle'));
  for (const {id} of ACTIVITIES) {
    assert.deepEqual(Object.keys(getPose(id)),keys);
    for (let time=0;time<core.getPerformanceDuration(id);time+=.13) {
      for (const [x,y] of [[0,0],[-40,-28],[40,28]]) {
        const pose=getAttentionPose(core.getPerformancePose(id,time),x,y);
        assert.ok(Object.values(pose).every(Number.isFinite),id);
        for (const side of ['l','r']) {
          const eye=getEyeGeometry(pose,side,0,0);
          for (let u=-1;u<=1;u+=.05) {
            const edge=getEyeEdges(eye,u);
            assert.ok(edge.lower-edge.upper>12,`${id} positive opening`);
            if (id==='complete') assert.ok(Math.abs(edge.lower-edge.upper-eye.height)<1e-7);
          }
        }
      }
    }
  }
});

test('activity transitions interrupt continuously, repeat without replay and settle with reduced motion', () => {
  const simulation=new EyeSimulation({random:()=>.5});
  simulation.follow=false;
  for (const {id} of ACTIVITIES) {
    simulation.setActivity(id);
    for (let i=0;i<18;i++) {
      const before={...simulation.lastFrame?.pose};
      const frame=simulation.update(1/60);
      assert.ok(Object.values(frame.pose).every(Number.isFinite));
      if (before.lh) assert.ok(Math.abs(frame.pose.lh-before.lh)<15);
    }
    const started=simulation.emotionAt;
    simulation.setActivity(id);
    assert.equal(simulation.emotionAt,started);
    simulation.reducedMotion=true;
    for(let i=0;i<240;i++)simulation.update(1/60);
    const expected=getPose(id), pose=simulation.lastFrame.pose;
    for(const key of ['lh','rh','lx','rx','gazeX','gazeY'])
      assert.ok(Math.abs(pose[key]-expected[key])<.01,`${id} settles ${key}`);
    const held=simulation.lastFrame.riveInputs;
    for(let i=0;i<120;i++)simulation.update(1/60);
    for(const key of Object.keys(held))
      assert.ok(Math.abs(held[key]-simulation.lastFrame.riveInputs[key])<.001,`${id} freezes ${key}`);
    simulation.reducedMotion=false;
  }
  const previous=simulation.emotion;
  assert.throws(()=>simulation.setActivity('invalid'),RangeError);
  assert.equal(simulation.emotion,previous);
});

test('small props stay within the shared composition and use the same accessory controls', () => {
  for (const {id} of ACTIVITIES) {
    const pose=getPose(id), states=core.getAccentStates(pose);
    const props=Object.entries(states).filter(([name,state])=>name.startsWith('prop-')&&state.opacity>.01);
    if (['listening','complete'].includes(id)) assert.equal(props.length,0,id);
    else assert.ok(props.length>=1,id);
    for (const [name,state] of props) {
      assert.ok(state.opacity<=.85);
      assert.ok(state.x<165&&state.y<130,name);
    }
    for (const [width,height] of [[375,812],[1440,900],[3440,1440],[1920,600]]) {
      const layout=getLayout(width,height,true);
      for (const state of Object.values(states).filter(s=>s.opacity>.01)) {
        assert.ok(layout.centerX+(state.x+pose.gazeX+28)*layout.scale<width,`${id} fits width`);
        assert.ok(layout.centerY+(state.y+pose.gazeY+28)*layout.scale*layout.stretchY<height,`${id} fits height`);
      }
    }
  }
});

test('props take part in the eye performance instead of remaining fixed state badges',()=>{
  for(const [id,prop,axis]of [['editing','pencil','x'],['searching','search','y'],
    ['mcp','plug-l','x'],['saving','save-arrow','y'],['skill','turn-page','scaleX']]) {
    const samples=[];
    for(let time=0;time<core.getPerformanceDuration(id);time+=.1)
      samples.push(core.getAccentStates(core.getPerformancePose(id,time))['prop-'+prop][axis]);
    assert.ok(Math.max(...samples)-Math.min(...samples)>(axis==='scaleX'?.4:5),id+' object participates');
  }
  for(const {id}of ACTIVITIES.filter(e=>!['listening','complete'].includes(e.id))) {
    const pose=getPose(id);
    assert.ok(core.accentDesigns.some(d=>d.prop&&d.depth>0&&core.getAccentStates(pose)[d.id].opacity>.01));
  }
  const left=core.getPropViewX(-1),right=core.getPropViewX(1),up=core.getPropViewY(-1),down=core.getPropViewY(1);
  assert.ok(left.rotation<0&&right.rotation>0);
  assert.ok(left.scaleX<1&&right.scaleX<1&&up.scaleY<1&&down.scaleY<1);
});

test('the native catalog and QML bindings match the authored shared expressions', () => {
  const manifest=JSON.parse(readFileSync('assets/eyes/manifest.json','utf8'));
  assert.deepEqual(manifest.activities,ACTIVITIES);
  assert.equal(new Set(ACTIVITIES.map(item=>item.id)).size,ACTIVITIES.length,
    'the activity catalog must not contain duplicate ids');
  const qml=readFileSync('packaging/plasma-wallpaper/org.eyes.wallpaper/contents/ui/RiveEyeScene.qml','utf8');
  for(const {id}of EXPRESSIONS)for(const variant of ['still','entry','act','follow','resolve']) {
    assert.ok(manifest.inputs.includes(id+variant));
  }
  assert.ok(manifest.inputs.includes('accents'));
  assert.match(qml,/stateMachineInterface\.updateInputs\(values\)/);
  assert.doesNotMatch(qml,/property real \w+: scene\.inputs\./);
});
