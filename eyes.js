import './vendor/sentient-eye-engine/rig.js';
import './eyes-core.js';

const core = globalThis.EyesCore;

export const EMOTIONS = core.EMOTIONS;
export const ACTIVITIES = core.ACTIVITIES;
export const EXPRESSIONS = core.EXPRESSIONS;
export const Spring = core.Spring;
export const getPose = core.getPose;
export const getLayout = core.getLayout;
export const getPointerGaze = core.getPointerGaze;
export const getAttentionPose = core.getAttentionPose;
export const getEyeGeometry = core.getEyeGeometry;
export const getEyeEdges = core.getEyeEdges;
export const getSurfacePoint = core.getSurfacePoint;
export const rig = core.rig;
export const eyePath = core.eyePath;
export const getLight = core.getLight;
export const getLightGeometry = core.getLightGeometry;
export const getLightFragments = core.getLightFragments;
export const attentionEnvelope = core.attentionEnvelope;
export const getAmbientGaze = core.getAmbientGaze;
export const getFixationMotion = core.getFixationMotion;
export const getExpressionAccent = core.getExpressionAccent;
export const blinkAmount = core.blinkAmount;
export const EyeSimulation = core.EyeSimulation;
export const drawLight = core.drawLight;

// Browser lifecycle stays here; all pose, spring and drawing behaviour lives in
// eyes-core.js and is shared verbatim with the Plasma wallpaper renderer.
export class Eyes {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = core.createSimulation();
    this.destroyed = false;
    import('./rive-renderer.js').then(({attachRive}) => {
      if (!this.destroyed) this.rive = attachRive(this.engine, canvas);
    }).catch(error => {
      canvas.dataset.renderer = 'fallback';
      console.error('Eyes Rive module could not load.', error);
    });
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.lastFrame = undefined;
    this.frameId = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.visibilityHandler = () => {
      this.engine.paused = document.hidden;
      this.lastFrame = undefined;
      if (!this.engine.paused) {
        this.frameId = requestAnimationFrame((time) => this.frame(time));
      } else {
        cancelAnimationFrame(this.frameId);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.resize();
    this.frameId = requestAnimationFrame((time) => this.frame(time));
  }

  get emotion() { return this.engine.emotion; }
  get energy() { return this.engine.energy; }
  set energy(value) { this.engine.energy = value; }
  get autonomous() { return this.engine.autonomous; }
  set autonomous(value) { this.engine.autonomous = Boolean(value); }
  get follow() { return this.engine.follow; }
  set follow(value) { this.engine.follow = Boolean(value); }
  get gaze() { return this.engine.gaze; }
  set gaze(value) { this.engine.gaze = value; }
  get pointer() { return this.engine.pointer; }
  set pointer(value) { this.engine.pointer = value; }
  get elapsed() { return this.engine.elapsed; }
  get layout() { return this.engine.layout; }
  get scale() { return this.engine.scale; }
  get paused() { return this.engine.paused; }
  set paused(value) { this.engine.paused = Boolean(value); }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    const immersive = document.body.classList.contains('immersive');
    this.engine.resize(rect.width, rect.height, this.dpr, immersive);
    this.canvas.parentElement.style.setProperty('--caption-y', `${this.engine.layout.captionY}px`);
  }

  setEmotion(id) {
    this.engine.setEmotion(id);
    this.canvas.setAttribute('aria-label', `${EXPRESSIONS.find((item) => item.id === id).name}的紫色双眼`);
  }

  setActivity(id) {
    core.getActivity(id);
    this.setEmotion(id);
  }

  blink(double = false) {
    this.engine.blink(double);
  }

  look(x, y, duration = 1.8) {
    this.engine.look(x, y, duration);
  }

  frame(timestamp) {
    if (this.engine.paused) return;
    const dt = this.lastFrame === undefined
      ? 1 / 60
      : Math.min((timestamp - this.lastFrame) / 1000, 0.064);
    this.lastFrame = timestamp;
    this.engine.reducedMotion = this.reducedMotion.matches;
    this.engine.update(dt);
    this.engine.draw(this.ctx);
    this.frameId = requestAnimationFrame((time) => this.frame(time));
  }

  drawLight(ctx, pose, geometry, side, time, blink) {
    core.drawLight(ctx, this.engine, pose, geometry, side, time, blink);
  }

  destroy() {
    this.destroyed = true;
    this.rive?.destroy();
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }
}
