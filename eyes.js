export const EMOTIONS = [
  { id: 'idle', name: '自在待命', short: '待命', description: '我在这里，随时准备出发。' },
  { id: 'happy', name: '有点开心', short: '开心', description: '好耶！又一起完成了一件小事。' },
  { id: 'curious', name: '好奇探头', short: '好奇', description: '咦？让我再靠近一点看看。' },
  { id: 'thinking', name: '认真思考', short: '思考', description: '唔…线索好像慢慢连起来了。' },
  { id: 'focused', name: '专注工作', short: '专注', description: '找到方向了，正在一点点推进。' },
  { id: 'surprised', name: '小小惊讶', short: '惊讶', description: '噢！这个发现有点意想不到。' },
  { id: 'sleepy', name: '困意来袭', short: '困困', description: '我只是…稍微休息一下下。' },
  { id: 'confused', name: '遇到问号', short: '困惑', description: '这里有一点疑惑，想听听你的想法。' },
];

const BASE = {
  lx: -112, ly: 0, lw: 136, lh: 140, lr: -0.012, la: 0,
  rx: 112, ry: 0, rw: 136, rh: 140, rr: 0.012, ra: 0,
  tilt: 0, gazeX: 0, gazeY: 0, glow: 0.5,
  lightX: -0.16, lightY: -0.18, lightStrength: 0.32, lightSpread: 0.46,
  lightHeight: 0.5, lightBias: 0, lightBreath: 0.018,
  thinking: 0, happy: 0, curious: 0, surprised: 0, sleepy: 0, confused: 0,
};
const POSES = {
  idle: {},
  happy: { lw: 148, rw: 148, lh: 57, rh: 57, ly: -8, ry: -8, lr: -0.045, rr: 0.045, la: 24, ra: 24, happy: 1, glow: 0.8, lightX: 0, lightY: -0.12, lightStrength: 0.36, lightSpread: 0.64, lightHeight: 0.58 },
  curious: { lx: -108, rx: 108, lw: 122, lh: 110, ly: 10, rw: 142, rh: 157, ry: -9, tilt: 0.065, curious: 1, glow: 0.65, lightX: -0.08, lightY: -0.22, lightStrength: 0.34, lightSpread: 0.46, lightHeight: 0.54, lightBias: 0.14 },
  thinking: { lh: 86, rh: 110, lw: 130, rw: 130, ly: -6, ry: -14, tilt: -0.045, gazeX: 11, gazeY: -9, thinking: 1, glow: 0.65, lightX: 0.14, lightY: -0.3, lightStrength: 0.29, lightSpread: 0.34, lightHeight: 0.42, lightBreath: 0.012 },
  focused: { lw: 144, rw: 144, lh: 92, rh: 92, lx: -108, rx: 108, lr: 0.07, rr: -0.07, glow: 0.7, lightX: 0.08, lightY: -0.34, lightStrength: 0.29, lightSpread: 0.62, lightHeight: 0.24, lightBreath: 0.006 },
  surprised: { lh: 170, rh: 170, lw: 143, rw: 143, lx: -119, rx: 119, ly: -5, ry: -5, surprised: 1, glow: 0.9, lightX: -0.02, lightY: -0.12, lightStrength: 0.37, lightSpread: 0.6, lightHeight: 0.66 },
  sleepy: { lh: 27, rh: 22, lw: 140, rw: 140, ly: 20, ry: 23, lr: 0.035, rr: -0.035, tilt: 0.03, sleepy: 1, glow: 0.2, lightX: -0.1, lightY: 0.18, lightStrength: 0.16, lightSpread: 0.56, lightHeight: 0.18, lightBreath: 0.012 },
  confused: { lw: 140, rw: 126, lh: 66, rh: 128, ly: 9, ry: -8, lr: -0.085, rr: 0.065, tilt: -0.055, confused: 1, glow: 0.45, lightX: -0.06, lightY: -0.08, lightStrength: 0.27, lightSpread: 0.4, lightHeight: 0.4, lightBias: 0.16 },
};

export function getPose(id) {
  if (!Object.hasOwn(POSES, id)) throw new RangeError(`Unknown emotion: ${id}`);
  return { ...BASE, ...POSES[id] };
}

export function getLayout(width, height, immersive = false) {
  const widthRatio = immersive ? (width < height ? 0.7 : 0.57) : (width < 720 ? 0.54 : 0.42);
  const scale = Math.min(width * widthRatio / 360, height * (immersive ? 0.34 : 0.4) / 140);
  const centerY = height * (immersive ? 0.5 : 0.445);
  return { scale, centerX: width / 2, centerY, captionY: Math.min(height - 64, centerY + 108 * scale + 23) };
}

export function getPointerGaze(clientX, clientY, rect, immersive = false) {
  const layout = getLayout(rect.width, rect.height, immersive);
  const normalize = (value) => Math.tanh(Math.max(-1, Math.min(1, value)) * 0.9) / Math.tanh(0.9);
  return {
    x: normalize((clientX - rect.left - layout.centerX) / Math.max(1, rect.width / 2)) * 40,
    y: normalize((clientY - rect.top - layout.centerY) / Math.max(1, rect.height / 2)) * 28,
  };
}

export function getAttentionPose(pose, gazeX, gazeY) {
  const x = Math.max(-1, Math.min(1, gazeX / 40));
  const y = Math.max(-1, Math.min(1, gazeY / 28));
  const turn = Math.abs(x);
  const convergence = turn * 6 + Math.max(0, y) * 3 - Math.max(0, -y) * 2;
  const verticalShape = 1 - Math.max(0, y) * 0.06 + Math.max(0, -y) * 0.04;
  return {
    ...pose, gazeX, gazeY,
    lx: pose.lx + convergence, rx: pose.rx - convergence,
    lw: pose.lw * (1 - turn * 0.02 - x * 0.035),
    rw: pose.rw * (1 - turn * 0.02 + x * 0.035),
    lh: pose.lh * verticalShape * (1 - x * 0.055),
    rh: pose.rh * verticalShape * (1 + x * 0.055),
    ly: pose.ly + x * 1.5, ry: pose.ry - x * 1.5,
    lr: pose.lr + x * 0.012 + y * 0.016,
    rr: pose.rr + x * 0.012 - y * 0.016,
    tilt: pose.tilt + x * 0.025,
  };
}

// Both long edges follow the same quadratic curve, preserving the band's thickness.
export function eyePath(ctx, width, height, bend = 0) {
  const r = Math.min(17, height * 0.25, width * 0.13);
  const edge = width / 2 - r;
  const normalizedEdge = 2 * edge / width;
  const edgeBend = -bend * (1 - normalizedEdge ** 2);
  const controlBend = -bend * (1 + normalizedEdge ** 2);
  // Continue the curve's tangent into each corner, avoiding flat shoulders.
  const cornerBend = edgeBend + 8 * bend * edge / width ** 2 * r;
  ctx.beginPath();
  ctx.moveTo(-edge, -height / 2 + edgeBend);
  ctx.quadraticCurveTo(0, -height / 2 + controlBend, edge, -height / 2 + edgeBend);
  ctx.quadraticCurveTo(width / 2, -height / 2 + cornerBend, width / 2, -height / 2 + r);
  ctx.lineTo(width / 2, height / 2 - r);
  ctx.quadraticCurveTo(width / 2, height / 2 + cornerBend, edge, height / 2 + edgeBend);
  ctx.quadraticCurveTo(0, height / 2 + controlBend, -edge, height / 2 + edgeBend);
  ctx.quadraticCurveTo(-width / 2, height / 2 + cornerBend, -width / 2, height / 2 - r);
  ctx.lineTo(-width / 2, -height / 2 + r);
  ctx.quadraticCurveTo(-width / 2, -height / 2 + cornerBend, -edge, -height / 2 + edgeBend);
  ctx.closePath();
}

export function getLight(pose, time, side = 'l') {
  const gazeX = pose.lightGazeX ?? pose.gazeX;
  const gazeY = pose.lightGazeY ?? pose.gazeY;
  const cue = Math.max(0, Math.min(1, pose.attentionAccent || 0));
  const breath = 1 + Math.sin(time * 0.8) * pose.lightBreath;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const asymmetry = (side === 'l' ? -1 : 1) * pose.lightBias;
  const spread = pose.lightSpread * (1 + asymmetry * 0.4 + cue * 0.025);
  const height = pose.lightHeight * (1 + asymmetry * 0.6 + cue * 0.025);
  // Move visibly toward the target, while leaving room for the broad reflection.
  const horizontalRoom = Math.max(0.1, 1 - spread - 0.06);
  const verticalRoom = Math.max(0.1, 1 - height - 0.06);
  const x = clamp(pose.lightX + gazeX * 0.014, -horizontalRoom, horizontalRoom);
  const y = clamp(pose.lightY + gazeY * 0.018, -verticalRoom, verticalRoom);
  return {
    x, y, spread, height,
    strength: clamp(pose.lightStrength * (1 + asymmetry) * breath + cue * 0.018, 0, 0.43),
    angle: 0,
    roundness: 0.2,
  };
}

export function getLightGeometry(light, width, height, bend) {
  const x = light.x * width * 0.5;
  const lightWidth = width * light.spread;
  const localBend = bend * (lightWidth / width) ** 2;
  // A patch on the eye follows the same parabolic surface as the whole eye.
  // Its tangent and curvature are inherited, rather than guessed by a rotation.
  const surfaceY = -bend * (1 - 4 * x ** 2 / width ** 2);
  return {
    x, y: light.y * height * 0.5 + surfaceY + localBend,
    width: lightWidth, height: Math.max(0.4, height * light.height),
    bend: localBend, slope: 8 * bend * x / width ** 2,
  };
}

const ease = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function attentionEnvelope(elapsed) {
  if (elapsed < 0 || elapsed >= 0.68) return 0;
  return elapsed < 0.12 ? ease(elapsed / 0.12) : 1 - ease((elapsed - 0.12) / 0.56);
}

// Deliberate look/hold/release beats. Continuous sinusoids are reserved for
// breathing, never used as free-running gaze trajectories.
export function getAmbientGaze(emotion, time) {
  if (emotion === 'thinking') {
    const t = time % 7.6;
    const shift = ease((t - 2.0) / 0.24) * (1 - ease((t - 3.25) / 0.32));
    if (shift === 0) return { x: 0, y: 0 };
    return { x: -5 * shift, y: 1.5 * shift };
  }
  if (emotion === 'idle') {
    const t = time % 16;
    const check = ease((t - 6) / 0.28) * (1 - ease((t - 7.35) / 0.36));
    if (check === 0) return { x: 0, y: 0 };
    return { x: 3.5 * check, y: -1 * check };
  }
  return { x: 0, y: 0 };
}

// A wide, low-contrast violet reflection is part of the eye's surface.
function surfaceLight(ctx, geometry, alpha, pixelsPerUnit) {
  const { x, y, width, height, bend, slope } = geometry;
  const blur = Math.min(width, height) * 0.18;
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, slope, 0, 1, 0, 0);
  ctx.filter = `blur(${blur * pixelsPerUnit}px)`;
  ctx.fillStyle = `rgba(220,183,251,${alpha})`;
  eyePath(ctx, width, height, bend);
  ctx.fill();
  ctx.restore();
}

export class Spring {
  constructor(value, stiffness = 170, damping = 18) {
    this.value = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  step(target, delta) {
    // Substeps keep spring integration stable after dropped or suspended frames.
    const duration = Math.max(0, Math.min(delta, 0.064));
    const steps = Math.max(1, Math.ceil(duration / (1 / 240)));
    const dt = duration / steps;
    for (let i = 0; i < steps; i++) {
      const acceleration = (target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;
    }
    return this.value;
  }
}

export function blinkAmount(elapsed, double = false) {
  const pulse = (time) => {
    if (time < 0 || time > 0.32) return 0;
    if (time < 0.085) return Math.sin(time / 0.085 * Math.PI / 2);
    if (time < 0.12) return 1;
    return Math.pow(1 - (time - 0.12) / 0.2, 2);
  };
  return Math.max(pulse(elapsed), double ? pulse(elapsed - 0.39) : 0);
}

export class Eyes {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emotion = 'idle';
    this.energy = 0.65;
    this.autonomous = true;
    this.follow = true;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.target = getPose('idle');
    this.springs = Object.fromEntries(Object.entries(this.target).map(([key, value]) => [key, new Spring(value)]));
    this.gaze = { x: 0, y: 0, until: 0 };
    this.pointer = { x: 0, y: 0, active: false };
    this.nextBlink = 2.5;
    this.blinkStart = -10;
    this.doubleBlink = false;
    this.elapsed = 0;
    this.lightTime = 0;
    this.lightGaze = { x: new Spring(0, 360, 38), y: new Spring(0, 360, 38) };
    this.attentionTarget = { x: 0, y: 0 };
    this.attentionAt = -10;
    this.emotionAt = 0;
    this.bounce = 0;
    this.paused = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.visibilityHandler = () => {
      this.paused = document.hidden;
      this.lastFrame = undefined;
      if (!this.paused) this.frameId = requestAnimationFrame((time) => this.frame(time));
      else cancelAnimationFrame(this.frameId);
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.resize();
    this.frameId = requestAnimationFrame((time) => this.frame(time));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.layout = getLayout(rect.width, rect.height, document.body.classList.contains('immersive'));
    this.scale = this.layout.scale;
    this.canvas.parentElement.style.setProperty('--caption-y', `${this.layout.captionY}px`);
  }

  setEmotion(id) {
    this.target = getPose(id);
    this.emotion = id;
    this.emotionAt = this.elapsed;
    this.attentionAt = this.elapsed;
    this.bounce = this.reducedMotion.matches ? 0 : 1;
    this.canvas.setAttribute('aria-label', `${EMOTIONS.find((item) => item.id === id).name}的紫色双眼`);
  }

  blink(double = false) {
    this.blinkStart = this.elapsed;
    this.doubleBlink = double;
    const interval = this.emotion === 'focused' ? 6.5 : this.emotion === 'sleepy' ? 3.5 : 4.5;
    this.nextBlink = this.elapsed + interval + Math.random() * 1.8;
  }

  look(x, y, duration = 1.8) {
    if (![x, y, duration].every(Number.isFinite)) throw new TypeError('Gaze coordinates and duration must be finite numbers');
    this.gaze = { x: Math.max(-1, Math.min(1, x)) * 40, y: Math.max(-1, Math.min(1, y)) * 28, until: this.elapsed + duration };
  }

  frame(timestamp) {
    if (this.paused) return;
    const dt = this.lastFrame === undefined ? 1 / 60 : Math.min((timestamp - this.lastFrame) / 1000, 0.064);
    this.lastFrame = timestamp;
    this.elapsed += dt;
    const t = this.elapsed;
    const reduce = this.reducedMotion.matches;
    const alive = this.autonomous && !reduce;
    const energy = reduce ? 0 : this.energy;
    const ambient = alive ? getAmbientGaze(this.emotion, t - this.emotionAt) : { x: 0, y: 0 };

    if (alive && t > this.nextBlink) this.blink(Math.random() > 0.72);
    const directed = t < this.gaze.until;
    const pointing = this.follow && (this.pointer.active || t < (this.pointer.until || 0));
    const gaze = directed ? this.gaze : pointing ? this.pointer : { x: ambient.x * energy, y: ambient.y * energy };
    const target = directed || pointing ? getAttentionPose(this.target, gaze.x, gaze.y) : { ...this.target, gazeX: this.target.gazeX + gaze.x, gazeY: this.target.gazeY + gaze.y };
    if (alive) {
      target.gazeY += Math.sin(t * 1.4) * 0.45 * energy;
      if (this.emotion === 'sleepy') {
        target.lh += Math.sin(t * 1.2) * 7;
        target.rh += Math.sin(t * 1.2 + 0.7) * 6;
        target.gazeY += Math.sin(t * 0.8) * 4;
      }
      if (this.emotion === 'happy') {
        const lift = Math.sin(t * 1.8) * 1.5 * energy;
        target.ly += lift;
        target.ry += lift;
        target.la += Math.sin(t * 1.8) * 0.8 * energy;
        target.ra = target.la;
      }
    }
    const values = {};
    for (const [key, spring] of Object.entries(this.springs)) {
      const attentionPosition = key === 'gazeX' || key === 'gazeY';
      spring.stiffness = attentionPosition ? 280 : 170;
      spring.damping = reduce ? 34 : attentionPosition ? 33.5 : 22 - energy * 7;
      values[key] = spring.step(target[key], dt);
    }
    const attentionChange = Math.hypot(target.gazeX - this.attentionTarget.x, target.gazeY - this.attentionTarget.y);
    if (attentionChange > 4.5 && t - this.attentionAt > 0.35) {
      this.attentionAt = t;
      this.attentionTarget = { x: target.gazeX, y: target.gazeY };
    }
    values.lightGazeX = this.lightGaze.x.step(values.gazeX, dt);
    values.lightGazeY = this.lightGaze.y.step(values.gazeY, dt);
    values.attentionAccent = reduce ? 0 : attentionEnvelope(t - this.attentionAt);
    if (!reduce) this.lightTime += dt;
    this.bounce *= Math.exp(-dt * 6);
    const bounce = reduce ? 0 : Math.sin((1 - this.bounce) * Math.PI * 2.6) * this.bounce * 0.042 * (0.3 + energy);
    this.draw(values, blinkAmount(t - this.blinkStart, this.doubleBlink), bounce, alive);
    this.frameId = requestAnimationFrame((time) => this.frame(time));
  }

  draw(pose, blink, bounce, alive) {
    const ctx = this.ctx;
    const t = this.elapsed;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.translate(this.layout.centerX, this.layout.centerY);
    ctx.scale(this.scale, this.scale);
    // A very quiet violet halo anchors the eyes without giving them a face or body.
    const halo = ctx.createRadialGradient(0, 0, 25, 0, 0, 285);
    halo.addColorStop(0, `rgba(160,99,236,${0.04 + pose.glow * 0.025})`);
    halo.addColorStop(1, 'rgba(160,99,236,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-285, -285, 570, 570);
    ctx.save();
    ctx.translate(pose.gazeX, pose.gazeY);
    ctx.rotate(pose.tilt);
    ctx.scale(1 + bounce, 1 - bounce);
    const breathe = alive ? Math.sin(t * 1.4) * 0.006 * this.energy : 0;
    for (const side of ['l', 'r']) {
      const w = Math.max(30, pose[`${side}w`] * (1 + breathe + blink * 0.1));
      const originalHeight = Math.max(6, pose[`${side}h`] * (1 - breathe));
      const h = Math.max(5, originalHeight * (1 - blink * 0.96));
      const bend = Math.max(0, pose[`${side}a`]) * (1 - blink);
      ctx.save();
      ctx.translate(pose[`${side}x`], pose[`${side}y`]);
      ctx.rotate(pose[`${side}r`]);
      eyePath(ctx, w, h, bend);
      ctx.shadowColor = `rgba(153,84,235,${0.14 + pose.glow * 0.19})`;
      ctx.shadowBlur = 9 + pose.glow * 13;
      ctx.fillStyle = '#9256e0';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.clip();
      this.drawLight(ctx, pose, w, h, bend, side, this.lightTime, blink);
      ctx.restore();
      ctx.restore();
    }
    this.drawAccents(ctx, pose, alive ? t : 0);
    ctx.restore();
  }

  drawLight(ctx, pose, width, height, bend, side, time, blink) {
    const light = getLight(pose, time, side);
    const top = -height / 2 - bend;
    const bottom = height / 2;
    const surface = ctx.createLinearGradient(0, top, 0, bottom);
    surface.addColorStop(0, 'rgba(219,179,255,0.17)');
    surface.addColorStop(0.55, 'rgba(168,113,239,0)');
    surface.addColorStop(1, 'rgba(87,36,165,0.1)');
    ctx.fillStyle = surface;
    ctx.fillRect(-width / 2, top - 2, width, bottom - top + 4);

    const intensity = light.strength * (1 - blink * 0.85);
    // This context already contains the eye's tilt, squish and blink. Keep that
    // transform and curve the reflection with the eye instead of cancelling it.
    surfaceLight(ctx, getLightGeometry(light, width, height, bend), intensity, this.scale * this.dpr);
  }

  drawAccents(ctx, pose, t) {
    const opacity = (value) => Math.max(0, Math.min(1, value));
    ctx.fillStyle = '#a076d7';
    ctx.strokeStyle = '#a076d7';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (pose.thinking > 0.01) {
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = opacity(pose.thinking) * (0.3 + 0.5 * (0.5 + Math.sin(t * 4 - i * 0.9) * 0.5));
        ctx.beginPath();
        ctx.arc(185 + i * 15, -82 - Math.sin(t * 3 - i * 0.7) * 3, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const sparkle = (x, y, size, alpha) => {
      ctx.globalAlpha = opacity(alpha);
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.quadraticCurveTo(x + size * 0.2, y - size * 0.2, x + size, y);
      ctx.quadraticCurveTo(x + size * 0.2, y + size * 0.2, x, y + size);
      ctx.quadraticCurveTo(x - size * 0.2, y + size * 0.2, x - size, y);
      ctx.quadraticCurveTo(x - size * 0.2, y - size * 0.2, x, y - size);
      ctx.fill();
    };
    if (pose.happy > 0.01) {
      sparkle(-218, -39 + Math.sin(t * 2.2) * 4, 8, pose.happy * 0.55);
      sparkle(214, -66 - Math.sin(t * 2.2) * 4, 10, pose.happy * 0.5);
      sparkle(230, -42, 4, pose.happy * 0.3);
    }
    if (pose.curious > 0.01) sparkle(202, -111 + Math.sin(t * 2) * 4, 8, pose.curious * 0.6);
    if (pose.surprised > 0.01) {
      ctx.globalAlpha = opacity(pose.surprised) * 0.65;
      for (const x of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x * 215, -80); ctx.lineTo(x * 225, -90);
        ctx.moveTo(x * 221, -60); ctx.lineTo(x * 235, -63);
        ctx.stroke();
      }
    }
    if (pose.sleepy > 0.01) {
      ctx.font = '500 20px ui-monospace, monospace';
      for (let i = 0; i < 3; i++) {
        const drift = (t * 0.22 + i / 3) % 1;
        ctx.globalAlpha = opacity(pose.sleepy) * Math.sin(drift * Math.PI) * 0.6;
        ctx.fillText('z', 198 + drift * 29, -15 - drift * 65);
      }
    }
    if (pose.confused > 0.01) {
      ctx.globalAlpha = opacity(pose.confused) * 0.65;
      ctx.font = '400 31px ui-rounded, system-ui, sans-serif';
      ctx.save();
      ctx.translate(207, -68 + Math.sin(t * 2) * 4);
      ctx.rotate(Math.sin(t * 1.8) * 0.1);
      ctx.fillText('?', 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }
}
