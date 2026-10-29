import Rive from './node_modules/@rive-app/canvas-advanced/canvas_advanced.mjs';

let shared;
function load() {
  return shared ||= Promise.all([
    Rive({locateFile: () => new URL('./node_modules/@rive-app/canvas-advanced/rive.wasm',import.meta.url).href}),
    fetch(new URL('./assets/eyes/eyes.riv',import.meta.url)).then(response => {
      if(!response.ok)throw new Error(`Eyes asset: ${response.status}`);
      return response.arrayBuffer();
    }),
  ]).then(async ([runtime,bytes]) => ({runtime,file:await runtime.load(new Uint8Array(bytes),undefined,false)}));
}

export class RiveRenderer {
  static async create(canvas) {
    const {runtime,file}=await load();
    return new RiveRenderer(canvas,runtime,file);
  }

  constructor(canvas,runtime,file) {
    this.runtime=runtime;
    this.artboard=file.artboardByName('Eyes');
    if(!this.artboard)throw new Error('Missing Eyes artboard');
    this.machine=new runtime.StateMachineInstance(this.artboard.stateMachineByName('Eyes'),this.artboard);
    this.inputs={};
    for(let i=0;i<this.machine.inputCount();i++) {
      const input=this.machine.input(i).asNumber();
      this.inputs[input.name]=input;
    }
    this.renderer=runtime.makeRenderer(canvas);
    this.matrix={};
    this.lastElapsed=0;
    this.canvas=canvas;
  }

  draw(engine) {
    const frame=engine.lastFrame;
    if(!frame)return;
    globalThis.EyesCore.applyFaceProjection(this.canvas,engine);
    for(const [key,value] of Object.entries(frame.riveInputs)) {
      if(!this.inputs[key])throw new Error(`Missing Rive input: ${key}`);
      this.inputs[key].value=value;
    }
    const delta=Math.max(0,Math.min(.064,engine.elapsed-this.lastElapsed));
    this.lastElapsed=engine.elapsed;
    this.machine.advanceAndApply(delta);
    this.artboard.advance(delta);
    const renderer=this.renderer, pose=frame.pose, layout=engine.layout;
    renderer.beginFrame();
    renderer.save();
    // Match the shared immersive layout, including its compressed vertical gaze.
    const sx=engine.dpr*layout.scale*(1+frame.bounce);
    const sy=engine.dpr*layout.scale*layout.stretchY*(1-frame.bounce);
    const m=this.matrix;
    m.xx=sx; m.xy=0; m.yx=0; m.yy=sy;
    m.tx=engine.dpr*(layout.centerX+layout.scale*pose.gazeX)-m.xx*280-m.yx*170;
    m.ty=engine.dpr*(layout.centerY+layout.scale*layout.stretchY*pose.gazeY*layout.gazeScaleY)-m.xy*280-m.yy*170;
    renderer.transform(m.xx,m.xy,m.yx,m.yy,m.tx,m.ty);
    this.artboard.draw(renderer);
    renderer.restore();
    renderer.flush();
    this.runtime.resolveAnimationFrame();
    this.canvas.dataset.renderer='rive';
  }

  destroy() {
    this.machine.delete();
    this.artboard.delete();
    this.renderer.delete();
  }
}

// Keep Node/QML simulation imports free of browser and WASM initialization.
export function attachRive(engine,canvas,onReady=()=>{}) {
  let destroyed=false;
  const original=engine.draw.bind(engine);
  let renderer;
  engine.draw=ctx=>{
    if(renderer) {
      try{return renderer.draw(engine);}catch(error){
        renderer.destroy(); renderer=undefined;
        canvas.dataset.renderer='fallback';
        console.error('Eyes Rive drawing failed; using shared spline renderer.',error);
      }
    }
    original(ctx);
  };
  const ready=RiveRenderer.create(canvas).then(value=>{
    if(destroyed){value.destroy();return;}
    renderer=value;
    onReady();
  }).catch(error=>{
    canvas.dataset.renderer='fallback';
    console.error('Eyes Rive renderer failed; using shared spline renderer.',error);
  });
  return {ready,destroy(){destroyed=true;renderer?.destroy();engine.draw=original;
    canvas.style.removeProperty('transform');canvas.style.removeProperty('transform-origin');}};
}
