// Compile the shared spline poses and acting scores into an editable Rive scene.
// Rive CLI is an authoring tool only; shipped Eyes needs no account or CLI.
import {mkdir, writeFile, readFile, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import '../vendor/sentient-eye-engine/rig.js';
import '../eyes-core.js';

const core = globalThis.EyesCore;
const root = new URL('../', import.meta.url);
const project = new URL('build/rive/', root);
const output = new URL('assets/eyes/', root);
await mkdir(project, {recursive: true});
await mkdir(output, {recursive: true});
let nextId = 10;
const id = () => `0:${nextId++}`;
const n = (v) => Number(v.toFixed(7));
const objects = [];
const record = (type, attrs, values) => {
  const key = id();
  objects.push({id: key, type, attrs, values});
  return key;
};
const properties = {x:13, y:14, rotation:15, scaleX:16, scaleY:17, opacity:18,
  inRotation:84, inDistance:85, outRotation:86, outDistance:87};

function vertices(eye) {
  const points = [];
  for (let i = 0; i < 5; i++) {
    const u = i / 2 - 1;
    points.push({x:u / 2, y:core.getEyeEdges(eye,u).upper / eye.height});
  }
  for (let i = 4; i >= 0; i--) {
    const u = i / 2 - 1;
    points.push({x:u / 2, y:core.getEyeEdges(eye,u).lower / eye.height});
  }
  points.forEach(p => { p.in = {x:p.x,y:p.y}; p.out = {x:p.x,y:p.y}; });
  for (let i = 0; i < 4; i++) {
    for (const upper of [true,false]) {
      const c = (upper ? eye.upper : eye.lower)[i];
      const a = {x:-.5+i/4+1/12,y:(c[0]+c[1]/3)/eye.height};
      const end = c[0]+c[1]+c[2]+c[3];
      const b = {x:-.5+i/4+1/6,y:(end-(c[1]+2*c[2]+3*c[3])/3)/eye.height};
      if (upper) { points[i].out=a; points[i+1].in=b; }
      else { points[9-i].in=a; points[8-i].out=b; }
    }
  }
  return points.map((p,i) => {
    function handle(h, leftward) {
      let angle=Math.atan2(h.y-p.y,h.x-p.x);
      if (leftward && angle<0) angle+=Math.PI*2;
      return [n(angle),n(Math.hypot(h.x-p.x,h.y-p.y))];
    }
    const incoming=handle(p.in,i>0&&i<5), outgoing=handle(p.out,i>=5&&i<9);
    return {x:n(p.x),y:n(p.y),inRotation:incoming[0],inDistance:incoming[1],
      outRotation:outgoing[0],outDistance:outgoing[1]};
  });
}

const sides=['l','r'];
const sceneId=id(), machineId=id(), blendId=id();
const weights=core.EMOTIONS.flatMap(e=>[e.id+'still',e.id+'act',e.id+'entry',e.id+'follow',e.id+'resolve']);
const inputIds=Object.fromEntries([...weights,'accents','flow','flowphase','blink','lookx','looky','lightx','lighty'].map(name=>[name,id()]));
const animationIds=weights.map(()=>id());
const geometryIds={};
let scene='';
for (const side of sides) {
  const pose=core.getPose('idle');
  const eye=core.getEyeGeometry(pose,side,0,0);
  const container=record('Node',{}, {x:280+pose[side+'x'],y:170+pose[side+'y'],scaleX:eye.width,scaleY:eye.height});
  const attention=id(), vertical=id(), lid=id(), shape=id(), lightLook=id();
  const reflectionSurface=record('Node',{}, {y:0,opacity:0});
  const points=vertices(eye);
  const vertexIds=points.map(v=>record('CubicDetachedVertex',{},v));
  const main=record('Shape',{}, {x:-.04,y:-.12});
  const bars=[record('Shape',{}, {x:-.1,y:.18,opacity:0}),record('Shape',{}, {x:.1,y:-.18,opacity:0})];
  geometryIds[side]={container,attention,vertical,lid,shape,lightLook,vertexIds,main,bars,reflectionSurface};
  const v=vertexIds.map((key,i)=>`<CubicDetachedVertex id="${key}" ${Object.entries(points[i]).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`).join('\n');
  scene+=`<Node id="${container}" name="${side}-eye" x="${280+pose[side+'x']}" y="${170+pose[side+'y']}" scaleX="${eye.width}" scaleY="${eye.height}">
    <Node id="${attention}" name="${side}-attention">
      <Node id="${vertical}" name="${side}-vertical-attention">
      <Node id="${lid}" name="${side}-blink">
        <Node id="${lightLook}" name="${side}-light-attention">
          <Shape id="${main}" name="${side}-diffuse" x="-.04" y="-.12">
            <Rectangle width="1.6" height="2.8"/>
            <Fill><RadialGradient startX="0" startY="0" endX=".52" endY="0">
              <GradientStop position="0" colorValue="2ED6B6F0"/>
              <GradientStop position=".45" colorValue="19D6B6F0"/>
              <GradientStop position="1" colorValue="00D6B6F0"/>
            </RadialGradient></Fill>
            <ClippingShape sourceId="${shape}"/>
          </Shape>
          <Node id="${reflectionSurface}" name="${side}-reflection-surface">
          ${bars.map((key,i)=>`<Shape id="${key}" name="${side}-reflection-${i}" opacity="0"><Rectangle width="${i===0?.20:.14}" height=".10"/>
            <Fill><LinearGradient startX="-.10" startY="0" endX=".10" endY="0"><GradientStop position="0" colorValue="00D6B6F0"/><GradientStop position=".4" colorValue="06D6B6F0"/><GradientStop position=".6" colorValue="06D6B6F0"/><GradientStop position="1" colorValue="00D6B6F0"/></LinearGradient></Fill><ClippingShape sourceId="${shape}"/></Shape>`).join('\n')}
          </Node>
        </Node>
        <Shape id="${shape}" name="${side}-surface"><PointsPath isClosed="true" isClockwise="true">${v}</PointsPath>
          <Fill><LinearGradient startX="0" startY="-.6" endX="0" endY=".6"><GradientStop position="0" colorValue="FF9C69DE"/><GradientStop position=".55" colorValue="FF8E52D5"/><GradientStop position="1" colorValue="FF7D45C4"/></LinearGradient></Fill>
        </Shape>
      </Node>
      </Node>
    </Node>
  </Node>`;
}

// Use the exact same font-free paths as the fallback renderer. Cubic handles
// remain vector data on both runtimes, including the transparent glasses rims.
function accentPath(commands) {
  const points=[];
  for(const [command,...v] of commands) {
    if(command==='Z')continue;
    const p={x:v.at(-2),y:v.at(-1)};
    p.in={x:p.x,y:p.y};p.out={x:p.x,y:p.y};
    if(command==='C') {
      points.at(-1).out={x:v[0],y:v[1]};
      p.in={x:v[2],y:v[3]};
    }
    points.push(p);
  }
  if(points.length>1 && points[0].x===points.at(-1).x && points[0].y===points.at(-1).y) {
    points[0].in=points.pop().in;
  }
  return `<PointsPath isClosed="true">${points.map(p=>{
    const attrs={x:p.x,y:p.y,
      inRotation:Math.atan2(p.in.y-p.y,p.in.x-p.x),inDistance:Math.hypot(p.in.x-p.x,p.in.y-p.y),
      outRotation:Math.atan2(p.out.y-p.y,p.out.x-p.x),outDistance:Math.hypot(p.out.x-p.x,p.out.y-p.y)};
    return `<CubicDetachedVertex ${Object.entries(attrs).map(([k,v])=>`${k}="${n(v)}"`).join(' ')}/>`;
  }).join('')}</PointsPath>`;
}
const accentRoot=id(), accentIds={};
const heldAccents=core.getAccentStates(core.getPose('idle'));
scene+=`<Node id="${accentRoot}" name="accessories" x="280" y="170">`;
for(const design of core.accentDesigns) {
  const key=record('Node',{},heldAccents[design.id]);
  accentIds[design.id]=key;
  scene+=`<Node id="${key}" name="accent-${design.id}" ${Object.entries(heldAccents[design.id]).map(([k,v])=>`${k}="${n(v)}"`).join(' ')}>
    <Shape>${design.paths.map(accentPath).join('')}<Fill><SolidColor colorValue="FF${(design.color || '#b08add').slice(1).toUpperCase()}"/></Fill></Shape></Node>`;
}
scene+='</Node>';

function snapshot(emotion,time,moving) {
  const pose=moving===2 ? core.getEntryPose(emotion) : moving===0 ? core.getPose(emotion)
    : core.getGesturePose(emotion, moving===1 ? 0 : moving-2);
  const values={};
  for (const side of sides) {
    const eye=core.getEyeGeometry(pose,side,0,0), keys=geometryIds[side];
    values[keys.container]={x:280+pose[side+'x'],y:170+pose[side+'y'],scaleX:eye.width,scaleY:eye.height};
    vertices(eye).forEach((v,i)=>{values[keys.vertexIds[i]]=v;});
    const light=core.getLight(pose,0,side);
    const center=core.getSurfacePoint(eye,light.x,light.y);
    values[keys.main]={x:center.x/eye.width,y:center.y/eye.height,opacity:light.strength/.18};
    values[keys.reflectionSurface]={y:core.getSurfacePoint(eye,0,0).y/eye.height};
  }
  for(const [name,state] of Object.entries(core.getAccentStates(pose)))
    values[accentIds[name]]=state;
  return values;
}
const vertexSet=new Set(sides.flatMap(side=>geometryIds[side].vertexIds));
const prop=(key,name)=>vertexSet.has(key)&&name==='x'?24:
  vertexSet.has(key)&&name==='y'?25:properties[name];

function timeline(name,animationId,values) {
  const body=Object.entries(values).map(([key,channels])=>
    `<KeyedObject objectId="${key}">${Object.entries(channels).map(([channel,value])=>
      `<KeyedProperty propertyKey="${prop(key,channel)}"><KeyFrameDouble frame="0" value="${n(value)}"/></KeyedProperty>`
    ).join('')}</KeyedObject>`).join('\n');
  return `<LinearAnimation id="${animationId}" name="${name}" fps="60" duration="60" loopValue="loop">${body}</LinearAnimation>`;
}
let timelines='';
core.EMOTIONS.forEach((emotion,e)=>{
  for(let variant=0;variant<5;variant++)
    timelines+=timeline(weights[e*5+variant],animationIds[e*5+variant],snapshot(emotion.id,0,variant));
});
let layers=`<StateMachineLayer name="Expression"><AnyState x="200" y="-120"/><ExitState x="400" y="-120"/><EntryState><StateTransition stateToId="${blendId}"/></EntryState><BlendStateDirect id="${blendId}" x="200" y="0">${weights.map((w,i)=>`<BlendAnimationDirect inputId="${inputIds[w]}" animationId="${animationIds[i]}"/>`).join('')}</BlendStateDirect></StateMachineLayer>`;
function control(name, poses) {
  const state=id(), animations=poses.map(()=>id());
  layers+=`<StateMachineLayer name="${name}"><AnyState x="200" y="-120"/><ExitState x="400" y="-120"/><EntryState><StateTransition stateToId="${state}"/></EntryState><BlendState1DInput id="${state}" inputId="${inputIds[name]}" x="200" y="0">${poses.map((p,i)=>`<BlendAnimation1D animationId="${animations[i]}" value="${p.value}"/>`).join('')}</BlendState1DInput></StateMachineLayer>`;
  poses.forEach((p,i)=>{timelines+=timeline(`${name}${i}`,animations[i],p.values);});
}
control('accents',[0,100].map(value=>({value,values:{[accentRoot]:{opacity:value/100}}})));
control('flow',[0,100].map(value=>({value,values:Object.fromEntries(sides.map(side=>
  [geometryIds[side].reflectionSurface,{opacity:value/100}]))})));
control('flowphase',Array.from({length:57},(_,index)=>{
  const values={}, time=index/4;
  for(const side of sides) core.getLightFragments(core.getPose('idle'),time,side).forEach((f,i)=>{
    values[geometryIds[side].bars[i]]={x:f.x/2,y:f.y/2,opacity:f.strength/.024};
  });
  return {value:index/56*100,values};
}));
control('blink',[0,100].map(value=>({value,values:Object.fromEntries(sides.map(s=>[geometryIds[s].lid,{scaleY:value?.012:1,y:value?.31:0}]))})));
control('lookx',[-1,0,1].map(value=>({value,values:Object.fromEntries(sides.flatMap((s,i)=>[
  [geometryIds[s].attention,{x:Math.abs(value)*(i===0?.015:-.015),
    scaleX:1+value*(i===0?-.025:.025),scaleY:1+value*(i===0?-.035:.035)}]
]))})));
control('looky',[-1,0,1].map(value=>({value,values:Object.fromEntries(sides.map(s=>[geometryIds[s].vertical,{scaleY:1-value*.04}]))})));
control('lightx',[-1,0,1].map(value=>({value,values:Object.fromEntries(sides.map(s=>[geometryIds[s].lightLook,{x:value*.07}]))})));
control('lighty',[-1,0,1].map(value=>({value,values:Object.fromEntries(sides.map(s=>[geometryIds[s].lightLook,{y:value*.06}]))})));

const source=`<Rive version="1" kind="fragment"><Artboard id="${sceneId}" name="Eyes" width="560" height="340" defaultStateMachineId="${machineId}">${scene}<StateMachine id="${machineId}" name="Eyes">${Object.entries(inputIds).map(([name,key])=>`<StateMachineNumber id="${key}" name="${name}" value="${name==='idlestill'||name==='accents'?100:0}"/>`).join('')}${layers}</StateMachine>${timelines}</Artboard></Rive>`;
await writeFile(new URL('scene.rml',project),source);
await writeFile(new URL('rive.yaml',project),'name: eyes\n');
const cli=process.env.EYES_RIVE_CLI || 'rive';
for (const args of [['--verify','--format=json'],['--once']]) {
  const result=spawnSync(cli,[project.pathname,...args],{stdio:'inherit',env:{...process.env,RIVE_ANALYTICS:'off'}});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
await copyFile(new URL('build/eyes.riv',project),new URL('eyes.riv',output));
const inputs=await Promise.all(['eyes-core.js','vendor/sentient-eye-engine/rig.js','tools/build-rive.mjs'].map(f=>readFile(new URL(f,root))));
const bytes=await readFile(new URL('eyes.riv',output));
await writeFile(new URL('manifest.json',output),JSON.stringify({format:1,artboard:'Eyes',stateMachine:'Eyes',
  inputs:Object.keys(inputIds),sourceHash:createHash('sha256').update(Buffer.concat(inputs)).digest('hex'),
  assetHash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},null,2)+'\n');
console.log(`Built shared Rive performance: ${bytes.length} bytes`);
