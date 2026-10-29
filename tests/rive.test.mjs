import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Rive from '../node_modules/@rive-app/canvas-advanced/canvas_advanced.mjs';
import {EyeSimulation,EMOTIONS,ACTIVITIES,EXPRESSIONS,getPose} from '../eyes.js';

const runtime=await Rive({wasmBinary:await readFile(new URL('../node_modules/@rive-app/canvas-advanced/rive.wasm',import.meta.url))});
const bytes=await readFile(new URL('../assets/eyes/eyes.riv',import.meta.url));
const file=await runtime.load(new Uint8Array(bytes),undefined,false);
const core=globalThis.EyesCore;
function scene() {
  const art=file.artboardByName('Eyes');
  const machine=new runtime.StateMachineInstance(art.stateMachineByName('Eyes'),art);
  const inputs={};
  for(let i=0;i<machine.inputCount();i++) {
    const input=machine.input(i).asNumber();
    inputs[input.name]=input;
  }
  return {art,machine,inputs,advance(sim,dt) {
    const frame=sim.update(dt);
    for(const [name,value]of Object.entries(frame.riveInputs))inputs[name].value=value;
    machine.advanceAndApply(dt);art.advance(dt);
    return frame;
  },destroy(){machine.delete();art.delete();}};
}

test('shipped Rive asset matches the shared source and has all runtime controls',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../assets/eyes/manifest.json',import.meta.url)));
  const sources=await Promise.all(['eyes-core.js','vendor/sentient-eye-engine/rig.js','tools/build-rive.mjs'].map(p=>readFile(new URL('../'+p,import.meta.url))));
  assert.equal(manifest.sourceHash,createHash('sha256').update(Buffer.concat(sources)).digest('hex'),
    'regenerate the Rive asset after changing its shared source');
  assert.equal(manifest.assetHash,createHash('sha256').update(bytes).digest('hex'));
  const current=scene();
  try{assert.deepEqual(Object.keys(current.inputs),manifest.inputs);}finally{current.destroy();}
});

test('actual Rive runtime converges to every shared pose through interrupted spring blends',()=>{
  const current=scene(), sim=new EyeSimulation({reducedMotion:true});
  try {
    for(const from of EMOTIONS)for(const to of EMOTIONS) {
      sim.setEmotion(from.id);
      for(let i=0;i<9;i++)current.advance(sim,1/60);
      sim.setEmotion(to.id);
      for(let i=0;i<240;i++) {
        const frame=current.advance(sim,1/60);
        assert.ok(Object.values(frame.riveInputs).every(Number.isFinite));
        for(const side of ['l','r']) {
          const node=current.art.node(side+'-eye');
          assert.ok(node.scaleX>100&&node.scaleX<190);
          assert.ok(node.scaleY>15&&node.scaleY<190);
        }
      }
      const target=getPose(to.id);
      for(const side of ['l','r']) {
        const node=current.art.node(side+'-eye');
        assert.ok(Math.abs(node.scaleX-target[side+'w'])<.01);
        assert.ok(Math.abs(node.scaleY-target[side+'h'])<.01,`${from.id} → ${to.id}`);
      }
    }
  }finally{current.destroy();}
});

test('Rive eyelids blink, attention changes the near eye, and reduced motion freezes acting',()=>{
  const current=scene(),sim=new EyeSimulation({random:()=>.5});
  sim.autonomous=false;
  try{
    for(let i=0;i<120;i++)current.advance(sim,1/60);
    sim.blink();current.advance(sim,.05);current.advance(sim,.05);
    assert.ok(current.art.node('l-blink').scaleY<.02);
    for(let i=0;i<60;i++)current.advance(sim,1/60);
    assert.ok(current.art.node('l-blink').scaleY>.99);
    sim.setPointer(40,-20,true);
    for(let i=0;i<120;i++)current.advance(sim,1/60);
    assert.ok(current.art.node('r-attention').scaleY>current.art.node('l-attention').scaleY);
    assert.ok(current.art.node('l-light-attention').x>.06);
    sim.autonomous=true;sim.setEmotion('curious');
    const heights=[];
    for(let i=0;i<12*60;i++){
      current.advance(sim,1/60);
      if(i>120)heights.push(current.art.node('r-eye').scaleY);
    }
    assert.ok(Math.max(...heights)-Math.min(...heights)>10,'authored acting must visibly change eyelid opening');
    sim.reducedMotion=true;
    for(let i=0;i<240;i++)current.advance(sim,1/60);
    const y=current.art.node('r-eye').scaleY;
    for(let i=0;i<180;i++)current.advance(sim,1/60);
    assert.ok(Math.abs(current.art.node('r-eye').scaleY-y)<.001);
  }finally{current.destroy();}
});

test('authored eyelids retain a positive opening throughout every motion score',()=>{
  for(const {id}of EMOTIONS)for(let t=0;t<core.getPerformanceDuration(id);t+=.05){
    const pose=core.getPerformancePose(id,t);
    for(const side of ['l','r']){
      const eye=core.getEyeGeometry(pose,side,0,0);
      for(let u=-1;u<=1;u+=.04){
        const edge=core.getEyeEdges(eye,u);
        assert.ok(edge.lower-edge.upper>10,id);
      }
    }
  }
});

test('actual Rive entry poses carry a distinct readable onset for every emotion',()=>{
  const current=scene();
  try {
    for(const {id} of EXPRESSIONS) {
      for(const input of Object.values(current.inputs))input.value=0;
      current.inputs[id+'still'].value=100;
      current.machine.advanceAndApply(1/60);current.art.advance(1/60);
      const before=['l','r'].map(side=>{
        const node=current.art.node(side+'-eye');
        return {height:node.scaleY,y:node.y};
      });
      current.inputs[id+'entry'].value=100;
      current.machine.advanceAndApply(1/60);current.art.advance(1/60);
      const expected=core.getEntryPose(id);
      let movement=0;
      for(const [index,side]of ['l','r'].entries()) {
        const actual=current.art.node(side+'-eye');
        assert.ok(Math.abs(actual.scaleY-expected[side+'h'])<.01,id+' entry height');
        assert.ok(Math.abs(actual.y-(170+expected[side+'y']))<.01,id+' entry lift');
        movement+=Math.abs(actual.scaleY-before[index].height)+Math.abs(actual.y-before[index].y);
      }
      assert.ok(movement>1,id+' must carry the onset into rendered geometry');
    }
  }finally{current.destroy();}
});

test('entry acting eases out, survives interruption and does not replay on repeated states',()=>{
  const current=scene(),sim=new EyeSimulation({random:()=>1});
  sim.follow=false;
  try {
    sim.setEmotion('happy');
    let minimumY=Infinity;
    for(let i=0;i<70;i++) {
      current.advance(sim,1/60);
      minimumY=Math.min(minimumY,current.art.node('r-eye').y);
    }
    assert.ok(minimumY<170+getPose('happy').ry-2,'joy should visibly lift before settling');
    sim.setEmotion('curious');
    for(let i=0;i<20;i++)current.advance(sim,1/60);
    sim.setEmotion('thinking');
    for(let i=0;i<240;i++)current.advance(sim,1/60);
    const age=sim.emotionAt;
    sim.setEmotion('thinking');
    current.advance(sim,1/60);
    assert.equal(sim.emotionAt,age);
    assert.ok(sim.lastFrame.riveInputs.thinkingentry<.01);
    sim.reducedMotion=true;
    for(let i=0;i<180;i++)current.advance(sim,1/60);
    assert.ok(Object.entries(sim.lastFrame.riveInputs)
      .filter(([name])=>name.endsWith('entry')).every(([,value])=>value<.01));
  }finally{current.destroy();}
});

test('authored motion returns to a resting pose with zero velocity at each loop boundary',()=>{
  for(const {id} of EMOTIONS) {
    const duration=core.getPerformanceDuration(id), epsilon=.001;
    const first=core.getPerformancePose(id,0), before=core.getPerformancePose(id,duration-epsilon);
    const after=core.getPerformancePose(id,epsilon);
    for(const key of Object.keys(first)) {
      assert.ok(Math.abs(first[key]-before[key])<1e-6,id+' loop '+key);
      assert.ok(Math.abs(first[key]-after[key])<1e-6,id+' starts in a hold '+key);
    }
  }
});

test('rendered eyelid acting follows the shared clock regardless of Rive playback phase',()=>{
  const early=scene(), late=scene(), sim=new EyeSimulation({random:()=>1});
  sim.follow=false;
  try {
    early.machine.advanceAndApply(2.75);early.art.advance(2.75);
    late.machine.advanceAndApply(8.4);late.art.advance(8.4);
    for(const emotion of ['curious','thinking','confused','sleepy']) {
      sim.setEmotion(emotion);
      for(let i=0;i<600;i++) {
        const frame=sim.update(1/60);
        for(const [current,delta] of [[early,1/60],[late,1/30]]) {
          for(const [name,value] of Object.entries(frame.riveInputs))current.inputs[name].value=value;
          current.machine.advanceAndApply(delta);current.art.advance(delta);
        }
        for(const side of ['l','r'])for(const property of ['x','y','scaleX','scaleY'])
          assert.ok(Math.abs(early.art.node(side+'-eye')[property]-late.art.node(side+'-eye')[property])<.001,
            emotion+' must not run on a second eyelid clock');
        for(const side of ['l','r'])for(const property of ['x','y'])
          assert.ok(Math.abs(early.art.node(side+'-reflection-0')[property]-
            late.art.node(side+'-reflection-0')[property])<.001,'reflections must share the paused clock');
      }
    }
  }finally{early.destroy();late.destroy();}
});

test('actual Rive accessories share the authored poses, paused clock and default visibility control',()=>{
  const current=scene(), sim=new EyeSimulation({reducedMotion:true});
  sim.follow=false;
  try {
    assert.equal(sim.accents,true);
    const brow=core.accentDesigns.find(design=>design.id==='brow-l');
    assert.ok(brow.paths.flat().every(command=>command[0]!=='C'),
      'brows must retain their faceted straight-edge geometry');
    assert.equal(core.accentDesigns.some(design=>design.id==='glasses'),false,
      'thinking glasses must stay removed');
    assert.equal(Object.hasOwn(core.getPose('thinking'),'glassesPush'),false,
      'the retired glasses push must not remain in the shared pose');
    for(const {id} of EXPRESSIONS) {
      sim.setEmotion(id);
      for(let i=0;i<240;i++)current.advance(sim,1/60);
      assert.equal(current.inputs.accents.value,100);
      const states=core.getAccentStates(core.getPose(id));
      for(const [name,state] of Object.entries(states)) {
        const node=current.art.node('accent-'+name);
        assert.ok(node,'missing actual vector accessory '+name);
        for(const property of ['x','y','scaleX','scaleY','rotation'])
          assert.ok(Math.abs(node[property]-state[property])<.002,`${id} ${name} ${property}`);
      }
      if(id==='focused'||id==='confused')for(const side of ['l','r']) {
        const brow=current.art.node('accent-brow-'+side),eye=current.art.node(side+'-eye');
        assert.ok(brow.scaleX*100*Math.cos(brow.rotation)>eye.scaleX,
          'The visible brow must remain longer than its eye, including its tilt');
      }
    }
    sim.reducedMotion=false;sim.autonomous=true;sim.setEmotion('happy');
    for(let i=0;i<100;i++)current.advance(sim,1/60);
    sim.paused=true;
    const held=current.art.node('accent-star-main').y;
    for(let i=0;i<30;i++)current.advance(sim,1/30);
    assert.equal(current.art.node('accent-star-main').y,held);
    sim.paused=false;sim.accents=false;current.advance(sim,1/60);
    assert.equal(current.inputs.accents.value,0);
  }finally{current.destroy();}
});

test('every activity reaches its authored Rive eye shape through interrupted work and blinking props stay independent',()=>{
  const current=scene(),sim=new EyeSimulation({reducedMotion:true});
  sim.follow=false;
  try {
    for(const {id} of ACTIVITIES) {
      sim.setActivity('running');
      for(let i=0;i<7;i++)current.advance(sim,1/60);
      sim.setActivity(id);
      for(let i=0;i<240;i++)current.advance(sim,1/60);
      for(const side of ['l','r']) {
        const node=current.art.node(side+'-eye'),pose=getPose(id);
        assert.ok(Math.abs(node.scaleX-pose[side+'w'])<.01,id+' width');
        assert.ok(Math.abs(node.scaleY-pose[side+'h'])<.01,id+' height');
      }
      const states=core.getAccentStates(getPose(id));
      const visible=Object.entries(states).filter(([name,state])=>name.startsWith('prop-')&&state.opacity>.01);
      sim.blink();current.advance(sim,.05);current.advance(sim,.05);
      assert.ok(current.art.node('l-blink').scaleY<.02);
      for(const [name,state]of visible) {
        const node=current.art.node('accent-'+name);
        assert.ok(Math.abs(node.x-state.x)<.002&&Math.abs(node.y-state.y)<.002);
      }
    }
  }finally{current.destroy();}
});

test('real Rive props share the gaze perspective and eye action clock',()=>{
  const current=scene(),sim=new EyeSimulation({random:()=>1});
  sim.follow=false;sim.nextBlink=1000;
  try {
    for(const id of ['editing','running','mcp','skill']) {
      sim.setActivity(id);
      const positions=[];
      for(let i=0;i<8*60;i++) {
        const frame=current.advance(sim,1/60);
        const yaw=core.getPropViewX(frame.pose.gazeX/40),pitch=core.getPropViewY(frame.pose.gazeY/28);
        assert.ok(Math.abs(current.art.node('prop-yaw').rotation-yaw.rotation)<.001);
        assert.ok(Math.abs(current.art.node('prop-pitch').scaleY-pitch.scaleY)<.001);
        const part={editing:'pencil',running:'terminal-a',mcp:'plug-l',skill:'turn-page'}[id];
        const node=current.art.node('accent-prop-'+part);
        if(i>90)positions.push(id==='skill'?node.scaleX:node.x+node.y);
      }
      if(id!=='running') assert.ok(Math.max(...positions)-Math.min(...positions)>(id==='skill'?.2:3),id+' acts with object');
    }
    sim.setPointer(40,-28,true);sim.follow=true;
    for(let i=0;i<180;i++)current.advance(sim,1/60);
    assert.ok(current.art.node('prop-yaw').rotation>.13);
    assert.ok(current.art.node('prop-pitch').rotation>.04);
  }finally{current.destroy();}
});
