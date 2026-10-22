/*
 * Shared Eyes eye engine.
 *
 * This file is deliberately a classic JavaScript library so the browser
 * wrapper in eyes.js and Plasma's QML JavaScript engine can both load it.
 */
var EyesCore = (function () {
  var EMOTIONS = [
    { id: 'idle', name: '自在待命', short: '待命', description: '我在这里，随时准备出发。' },
    { id: 'happy', name: '有点开心', short: '开心', description: '好耶！又一起完成了一件小事。' },
    { id: 'curious', name: '好奇探头', short: '好奇', description: '咦？让我再靠近一点看看。' },
    { id: 'thinking', name: '认真思考', short: '思考', description: '唔…线索好像慢慢连起来了。' },
    { id: 'focused', name: '专注工作', short: '专注', description: '找到方向了，正在一点点推进。' },
    { id: 'surprised', name: '小小惊讶', short: '惊讶', description: '噢！这个发现有点意想不到。' },
    { id: 'sleepy', name: '困意来袭', short: '困困', description: '我只是…稍微休息一下下。' },
    { id: 'confused', name: '遇到问号', short: '困惑', description: '这里有一点疑惑，想听听你的想法。' },
  ];

  var BASE = {
    lx: -112, ly: 0, lw: 136, lh: 140, lr: -0.012, la: 0,
    rx: 112, ry: 0, rw: 136, rh: 140, rr: 0.012, ra: 0,
    tilt: 0, gazeX: 0, gazeY: 0, glow: 0.5,
    lightX: -0.16, lightY: -0.18, lightStrength: 0.32, lightSpread: 0.46,
    lightHeight: 0.5, lightBias: 0, lightBreath: 0.018,
    thinking: 0, happy: 0, curious: 0, surprised: 0, sleepy: 0, confused: 0,
  };

  var POSES = {
    idle: {},
    happy: {
      lw: 148, rw: 148, lh: 57, rh: 57, ly: -8, ry: -8,
      lr: -0.045, rr: 0.045, la: 24, ra: 24, happy: 1, glow: 0.8,
      lightX: 0, lightY: -0.12, lightStrength: 0.36,
      lightSpread: 0.64, lightHeight: 0.58,
    },
    curious: {
      lx: -108, rx: 108, lw: 122, lh: 110, ly: 10,
      rw: 142, rh: 157, ry: -9, tilt: 0.065, curious: 1,
      glow: 0.65, lightX: -0.08, lightY: -0.22,
      lightStrength: 0.34, lightSpread: 0.46,
      lightHeight: 0.54, lightBias: 0.14,
    },
    thinking: {
      lh: 86, rh: 110, lw: 130, rw: 130, ly: -6, ry: -14,
      tilt: -0.045, gazeX: 11, gazeY: -9, thinking: 1, glow: 0.65,
      lightX: 0.14, lightY: -0.3, lightStrength: 0.29,
      lightSpread: 0.34, lightHeight: 0.42, lightBreath: 0.012,
    },
    focused: {
      lw: 144, rw: 144, lh: 92, rh: 92, lx: -108, rx: 108,
      lr: 0.07, rr: -0.07, glow: 0.7, lightX: 0.08, lightY: -0.34,
      lightStrength: 0.29, lightSpread: 0.62,
      lightHeight: 0.24, lightBreath: 0.006,
    },
    surprised: {
      lh: 170, rh: 170, lw: 143, rw: 143, lx: -119, rx: 119,
      ly: -5, ry: -5, surprised: 1, glow: 0.9,
      lightX: -0.02, lightY: -0.12, lightStrength: 0.37,
      lightSpread: 0.6, lightHeight: 0.66,
    },
    sleepy: {
      lh: 27, rh: 22, lw: 140, rw: 140, ly: 20, ry: 23,
      lr: 0.035, rr: -0.035, tilt: 0.03, sleepy: 1, glow: 0.2,
      lightX: -0.1, lightY: 0.18, lightStrength: 0.16,
      lightSpread: 0.56, lightHeight: 0.18, lightBreath: 0.012,
    },
    confused: {
      lw: 140, rw: 126, lh: 66, rh: 128, ly: 9, ry: -8,
      lr: -0.085, rr: 0.065, tilt: -0.055, confused: 1, glow: 0.45,
      lightX: -0.06, lightY: -0.08, lightStrength: 0.27,
      lightSpread: 0.4, lightHeight: 0.4, lightBias: 0.16,
    },
  };

  function clone(object) {
    var result = {};
    for (var key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) result[key] = object[key];
    }
    return result;
  }

  function getPose(id) {
    if (!Object.prototype.hasOwnProperty.call(POSES, id)) {
      throw new RangeError('Unknown emotion: ' + id);
    }
    var pose = clone(BASE);
    var overrides = POSES[id];
    for (var key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) pose[key] = overrides[key];
    }
    return pose;
  }

  function getLayout(width, height, immersive) {
    var wide = Boolean(immersive);
    var stretchY = wide ? 1.28 : 1;
    var widthRatio = wide
      ? (width < height ? 0.7 : 0.57)
      : (width < 720 ? 0.54 : 0.42);
    var scale = Math.min(
      width * widthRatio / 360,
      height * (wide ? 0.46 : 0.4) / (140 * stretchY)
    );
    var centerY = height * (wide ? 0.43 : 0.445);
    return {
      scale: scale,
      stretchY: stretchY,
      gazeScaleY: wide ? 0.7 : 1,
      centerX: width / 2,
      centerY: centerY,
      captionY: Math.min(height - 64, centerY + 108 * scale * stretchY + 23),
    };
  }

  function getPointerGaze(clientX, clientY, rect, immersive) {
    var layout = getLayout(rect.width, rect.height, immersive);
    function normalize(value) {
      var bounded = Math.max(-1, Math.min(1, value));
      return Math.tanh(bounded * 0.9) / Math.tanh(0.9);
    }
    return {
      x: normalize((clientX - rect.left - layout.centerX) / Math.max(1, rect.width / 2)) * 40,
      y: normalize((clientY - rect.top - layout.centerY) / Math.max(1, rect.height / 2)) * 28,
    };
  }

  function getAttentionPose(pose, gazeX, gazeY) {
    var x = Math.max(-1, Math.min(1, gazeX / 40));
    var y = Math.max(-1, Math.min(1, gazeY / 28));
    var turn = Math.abs(x);
    var convergence = turn * 6 + Math.max(0, y) * 3 - Math.max(0, -y) * 2;
    var verticalShape = 1 - Math.max(0, y) * 0.06 + Math.max(0, -y) * 0.04;
    var result = clone(pose);
    result.gazeX = gazeX;
    result.gazeY = gazeY;
    result.lx = pose.lx + convergence;
    result.rx = pose.rx - convergence;
    result.lw = pose.lw * (1 - turn * 0.02 - x * 0.035);
    result.rw = pose.rw * (1 - turn * 0.02 + x * 0.035);
    result.lh = pose.lh * verticalShape * (1 - x * 0.055);
    result.rh = pose.rh * verticalShape * (1 + x * 0.055);
    result.ly = pose.ly + x * 1.5;
    result.ry = pose.ry - x * 1.5;
    result.lr = pose.lr + x * 0.012 + y * 0.016;
    result.rr = pose.rr + x * 0.012 - y * 0.016;
    result.tilt = pose.tilt + x * 0.025;
    return result;
  }

  function getEyeGeometry(pose, side, blink, breathe) {
    return {
      width: Math.max(30, pose[side + 'w'] * (1 + breathe + blink * 0.1)),
      height: Math.max(6, pose[side + 'h'] * (1 - breathe)) * (1 - blink * 0.96),
      bend: Math.max(0, pose[side + 'a']) * (1 - blink),
    };
  }

  // Both long edges follow the same quadratic curve, preserving band thickness.
  function eyePath(ctx, width, height, bend) {
    bend = bend || 0;
    var r = 0;
    var edge = width / 2 - r;
    var normalizedEdge = 2 * edge / width;
    var edgeBend = -bend * (1 - Math.pow(normalizedEdge, 2));
    var controlBend = -bend * (1 + Math.pow(normalizedEdge, 2));
    var cornerBend = edgeBend + 8 * bend * edge / Math.pow(width, 2) * r;
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

  function getLight(pose, time, side) {
    side = side || 'l';
    var gazeX = pose.lightGazeX === undefined ? pose.gazeX : pose.lightGazeX;
    var gazeY = pose.lightGazeY === undefined ? pose.gazeY : pose.lightGazeY;
    var cue = Math.max(0, Math.min(1, pose.attentionAccent || 0));
    var breath = 1 + Math.sin(time * 0.8) * pose.lightBreath;
    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
    var asymmetry = (side === 'l' ? -1 : 1) * pose.lightBias;
    var spread = pose.lightSpread * (1 + asymmetry * 0.4 + cue * 0.025);
    var height = pose.lightHeight * (1 + asymmetry * 0.6 + cue * 0.025);
    var horizontalRoom = Math.max(0.1, 1 - spread - 0.06);
    var verticalRoom = Math.max(0.1, 1 - height - 0.06);
    var x = clamp(pose.lightX + gazeX * 0.014, -horizontalRoom, horizontalRoom);
    var y = clamp(pose.lightY + gazeY * 0.018, -verticalRoom, verticalRoom);
    return {
      x: x,
      y: y,
      spread: spread,
      height: height,
      strength: clamp(pose.lightStrength * (1 + asymmetry) * breath + cue * 0.018, 0, 0.43),
      angle: 0,
      roundness: 0.2,
    };
  }

  function getLightGeometry(light, width, height, bend) {
    var x = light.x * width * 0.5;
    var lightWidth = width * light.spread;
    var localBend = bend * Math.pow(lightWidth / width, 2);
    var surfaceY = -bend * (1 - 4 * Math.pow(x, 2) / Math.pow(width, 2));
    return {
      x: x,
      y: light.y * height * 0.5 + surfaceY + localBend,
      width: lightWidth,
      height: Math.max(0.4, height * light.height),
      bend: localBend,
      slope: 8 * bend * x / Math.pow(width, 2),
    };
  }

  function getLightFragments(pose, time, side) {
    var main = getLight(pose, 0, side);
    var calm = (1 - pose.sleepy * 0.65) * Math.min(1, pose.lightHeight / 0.42);
    var strength = (0.075 + pose.happy * 0.012 + pose.curious * 0.008) * calm;
    var fragments = [];
    for (var i = 0; i < 2; ++i) {
      var phase = ((time / 14 + i * 0.5) % 1 + 1) % 1;
      var envelope = Math.pow(Math.sin(phase * Math.PI), 2);
      fragments.push({
        x: main.x * 0.55 + (phase - 0.5) * 0.52,
        y: main.y * 0.3 + (i === 0 ? 0.34 : -0.38),
        spread: i === 0 ? 0.20 : 0.14,
        height: i === 0 ? 0.15 : 0.11,
        strength: strength * envelope * (i === 0 ? 1 : 0.72),
        angle: 0,
        roundness: 0,
      });
    }
    return fragments;
  }

  function ease(value) {
    var t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }

  function attentionEnvelope(elapsed) {
    if (elapsed < 0 || elapsed >= 0.68) return 0;
    return elapsed < 0.12
      ? ease(elapsed / 0.12)
      : 1 - ease((elapsed - 0.12) / 0.56);
  }

  // Purposeful look-hold-release beats; no free-running gaze sinusoid.
  function getAmbientGaze(emotion, time) {
    if (emotion === 'thinking') {
      var thinkingTime = time % 7.6;
      var thinkingShift =
        ease((thinkingTime - 2.0) / 0.24) *
        (1 - ease((thinkingTime - 3.25) / 0.32));
      if (thinkingShift === 0) return { x: 0, y: 0 };
      return { x: -5 * thinkingShift, y: 1.5 * thinkingShift };
    }
    if (emotion === 'idle') {
      var idleTime = time % 16;
      var check =
        ease((idleTime - 6) / 0.28) *
        (1 - ease((idleTime - 7.35) / 0.36));
      if (check === 0) return { x: 0, y: 0 };
      return { x: 3.5 * check, y: -check };
    }
    return { x: 0, y: 0 };
  }

  function Spring(value, stiffness, damping) {
    this.value = value;
    this.velocity = 0;
    this.stiffness = stiffness === undefined ? 170 : stiffness;
    this.damping = damping === undefined ? 18 : damping;
  }

  Spring.prototype.step = function (target, delta) {
    var duration = Math.max(0, Math.min(delta, 0.064));
    var steps = Math.max(1, Math.ceil(duration / (1 / 240)));
    var dt = duration / steps;
    for (var i = 0; i < steps; i++) {
      var acceleration =
        (target - this.value) * this.stiffness -
        this.velocity * this.damping;
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;
    }
    return this.value;
  };

  function blinkAmount(elapsed, doubleBlink) {
    function pulse(time) {
      if (time < 0 || time > 0.32) return 0;
      if (time < 0.085) return Math.sin(time / 0.085 * Math.PI / 2);
      if (time < 0.12) return 1;
      return Math.pow(1 - (time - 0.12) / 0.2, 2);
    }
    return Math.max(
      pulse(elapsed),
      doubleBlink ? pulse(elapsed - 0.39) : 0
    );
  }

  function EyeSimulation(options) {
    options = options || {};
    this.emotion = 'idle';
    this.energy = 0.65;
    this.autonomous = true;
    this.follow = true;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.paused = false;
    this.target = getPose('idle');
    this.springs = {};
    for (var key in this.target) {
      if (Object.prototype.hasOwnProperty.call(this.target, key)) {
        this.springs[key] = new Spring(this.target[key]);
      }
    }
    this.gaze = { x: 0, y: 0, until: 0 };
    this.pointer = { x: 0, y: 0, active: false, until: 0 };
    this.nextBlink = 2.5;
    this.blinkStart = -10;
    this.doubleBlink = false;
    this.elapsed = 0;
    this.lightTime = 0;
    this.flowTime = 0;
    this.lightGaze = {
      x: new Spring(0, 360, 38),
      y: new Spring(0, 360, 38),
    };
    this.attentionTarget = { x: 0, y: 0 };
    this.attentionAt = -10;
    this.emotionAt = 0;
    this.bounce = 0;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.layout = getLayout(1, 1, Boolean(options.immersive));
    this.scale = this.layout.scale;
    this.lastFrame = null;
  }

  EyeSimulation.prototype.resize = function (width, height, dpr, immersive) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.max(0.1, dpr || 1);
    this.layout = getLayout(this.width, this.height, Boolean(immersive));
    this.scale = this.layout.scale;
    return this.layout;
  };

  EyeSimulation.prototype.setEmotion = function (id) {
    this.target = getPose(id);
    this.emotion = id;
    this.emotionAt = this.elapsed;
    this.attentionAt = this.elapsed;
    this.bounce = this.reducedMotion ? 0 : 1;
  };

  EyeSimulation.prototype.blink = function (doubleBlink) {
    this.blinkStart = this.elapsed;
    this.doubleBlink = Boolean(doubleBlink);
    var interval = this.emotion === 'focused'
      ? 6.5
      : this.emotion === 'sleepy'
        ? 3.5
        : 4.5;
    this.nextBlink = this.elapsed + interval + Math.random() * 1.8;
  };

  EyeSimulation.prototype.look = function (x, y, duration) {
    duration = duration === undefined ? 1.8 : duration;
    if (![x, y, duration].every(Number.isFinite)) {
      throw new TypeError('Gaze coordinates and duration must be finite numbers');
    }
    this.gaze = {
      x: Math.max(-1, Math.min(1, x)) * 40,
      y: Math.max(-1, Math.min(1, y)) * 28,
      until: this.elapsed + duration,
    };
  };

  EyeSimulation.prototype.setPointer = function (x, y, active) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = Boolean(active);
    this.pointer.until = 0;
  };

  EyeSimulation.prototype.update = function (delta) {
    if (this.paused) return this.lastFrame;
    var dt = Math.max(0, Math.min(delta, 0.064));
    this.elapsed += dt;
    var t = this.elapsed;
    var reduce = Boolean(this.reducedMotion);
    var alive = this.autonomous && !reduce;
    var energy = reduce ? 0 : this.energy;
    var ambient = alive
      ? getAmbientGaze(this.emotion, t - this.emotionAt)
      : { x: 0, y: 0 };

    if (alive && t > this.nextBlink) this.blink(Math.random() > 0.72);
    var directed = t < this.gaze.until;
    var pointing = this.follow && (this.pointer.active || t < (this.pointer.until || 0));
    var gaze = directed
      ? this.gaze
      : pointing
        ? this.pointer
        : { x: ambient.x * energy, y: ambient.y * energy };
    var target = directed || pointing
      ? getAttentionPose(this.target, gaze.x, gaze.y)
      : clone(this.target);

    if (!(directed || pointing)) {
      target.gazeX = this.target.gazeX + gaze.x;
      target.gazeY = this.target.gazeY + gaze.y;
    }
    if (alive) {
      target.gazeY += Math.sin(t * 1.4) * 0.45 * energy;
      if (this.emotion === 'sleepy') {
        target.lh += Math.sin(t * 1.2) * 7;
        target.rh += Math.sin(t * 1.2 + 0.7) * 6;
        target.gazeY += Math.sin(t * 0.8) * 4;
      }
      if (this.emotion === 'happy') {
        var lift = Math.sin(t * 1.8) * 1.5 * energy;
        target.ly += lift;
        target.ry += lift;
        target.la += Math.sin(t * 1.8) * 0.8 * energy;
        target.ra = target.la;
      }
    }

    var values = {};
    for (var key in this.springs) {
      if (!Object.prototype.hasOwnProperty.call(this.springs, key)) continue;
      var spring = this.springs[key];
      var attentionPosition = key === 'gazeX' || key === 'gazeY';
      spring.stiffness = attentionPosition ? 280 : 170;
      spring.damping = reduce ? 34 : attentionPosition ? 33.5 : 22 - energy * 7;
      values[key] = spring.step(target[key], dt);
    }

    var attentionChange = Math.hypot(
      target.gazeX - this.attentionTarget.x,
      target.gazeY - this.attentionTarget.y
    );
    if (attentionChange > 4.5 && t - this.attentionAt > 0.35) {
      this.attentionAt = t;
      this.attentionTarget = { x: target.gazeX, y: target.gazeY };
    }
    values.lightGazeX = this.lightGaze.x.step(values.gazeX, dt);
    values.lightGazeY = this.lightGaze.y.step(values.gazeY, dt);
    values.attentionAccent = reduce ? 0 : attentionEnvelope(t - this.attentionAt);
    if (!reduce) this.lightTime += dt;
    if (alive) this.flowTime += dt;
    this.bounce *= Math.exp(-dt * 6);
    var bounce = reduce
      ? 0
      : Math.sin((1 - this.bounce) * Math.PI * 2.6) *
        this.bounce * 0.042 * (0.3 + energy);

    this.lastFrame = {
      pose: values,
      blink: blinkAmount(t - this.blinkStart, this.doubleBlink),
      bounce: bounce,
      alive: alive,
    };
    return this.lastFrame;
  };

  function drawSoftSurfaceLight(ctx, geometry, alpha) {
    // QML Canvas has only one global context and no CSS filter. Layered,
    // progressively larger bands create the same quiet, soft geometric light.
    var layers = 5;
    for (var i = layers - 1; i >= 0; i--) {
      var expansion = i / layers;
      var width = geometry.width * (1 + expansion * 0.22);
      var height = geometry.height * (1 + expansion * 0.32);
      ctx.save();
      ctx.translate(geometry.x, geometry.y);
      ctx.transform(1, geometry.slope, 0, 1, 0, 0);
      ctx.globalAlpha = alpha * (0.16 + 0.11 * (layers - i));
      ctx.fillStyle = 'rgba(220,183,251,1)';
      eyePath(ctx, width, height, geometry.bend);
      ctx.fill();
      ctx.restore();
    }
  }

  function surfaceLight(ctx, geometry, alpha, pixelsPerUnit) {
    var filterSupported = typeof ctx.filter === 'string';
    if (!filterSupported) {
      drawSoftSurfaceLight(ctx, geometry, alpha);
      return;
    }
    var blur = Math.min(geometry.width, geometry.height) * 0.18;
    ctx.save();
    ctx.translate(geometry.x, geometry.y);
    ctx.transform(1, geometry.slope, 0, 1, 0, 0);
    ctx.filter = 'blur(' + blur * pixelsPerUnit + 'px)';
    ctx.fillStyle = 'rgba(220,183,251,' + alpha + ')';
    eyePath(ctx, geometry.width, geometry.height, geometry.bend);
    ctx.fill();
    ctx.restore();
  }

  function drawLight(ctx, simulation, pose, width, height, bend, side, time, blink) {
    var light = getLight(pose, time, side);

    surfaceLight(
      ctx,
      getLightGeometry(light, width, height, bend),
      light.strength * (1 - blink * 0.85),
      simulation.scale * simulation.dpr
    );
    var fragments = getLightFragments(pose, simulation.flowTime || 0, side);
    for (var i = 0; i < fragments.length; ++i) {
      surfaceLight(ctx, getLightGeometry(fragments[i], width, height, bend),
        fragments[i].strength * (1 - blink * 0.85), simulation.scale * simulation.dpr);
    }
  }

  function drawAccents(ctx, pose, time) {
    function opacity(value) {
      return Math.max(0, Math.min(1, value));
    }
    ctx.fillStyle = '#a076d7';
    ctx.strokeStyle = '#a076d7';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (pose.thinking > 0.01) {
      for (var i = 0; i < 3; i++) {
        ctx.globalAlpha =
          opacity(pose.thinking) *
          (0.3 + 0.5 * (0.5 + Math.sin(time * 4 - i * 0.9) * 0.5));
        ctx.beginPath();
        ctx.arc(
          185 + i * 15,
          -82 - Math.sin(time * 3 - i * 0.7) * 3,
          3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    function sparkle(x, y, size, alpha) {
      ctx.globalAlpha = opacity(alpha);
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.quadraticCurveTo(x + size * 0.2, y - size * 0.2, x + size, y);
      ctx.quadraticCurveTo(x + size * 0.2, y + size * 0.2, x, y + size);
      ctx.quadraticCurveTo(x - size * 0.2, y + size * 0.2, x - size, y);
      ctx.quadraticCurveTo(x - size * 0.2, y - size * 0.2, x, y - size);
      ctx.fill();
    }
    if (pose.happy > 0.01) {
      sparkle(-218, -39 + Math.sin(time * 2.2) * 4, 8, pose.happy * 0.55);
      sparkle(214, -66 - Math.sin(time * 2.2) * 4, 10, pose.happy * 0.5);
      sparkle(230, -42, 4, pose.happy * 0.3);
    }
    if (pose.curious > 0.01) {
      sparkle(202, -111 + Math.sin(time * 2) * 4, 8, pose.curious * 0.6);
    }
    if (pose.surprised > 0.01) {
      ctx.globalAlpha = opacity(pose.surprised) * 0.65;
      for (var j = 0; j < 2; j++) {
        var x = j === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x * 215, -80);
        ctx.lineTo(x * 225, -90);
        ctx.moveTo(x * 221, -60);
        ctx.lineTo(x * 235, -63);
        ctx.stroke();
      }
    }
    if (pose.sleepy > 0.01) {
      ctx.font = '500 20px monospace';
      for (var z = 0; z < 3; z++) {
        var drift = (time * 0.22 + z / 3) % 1;
        ctx.globalAlpha = opacity(pose.sleepy) * Math.sin(drift * Math.PI) * 0.6;
        ctx.fillText('z', 198 + drift * 29, -15 - drift * 65);
      }
    }
    if (pose.confused > 0.01) {
      ctx.globalAlpha = opacity(pose.confused) * 0.65;
      ctx.font = '400 31px sans-serif';
      ctx.save();
      ctx.translate(207, -68 + Math.sin(time * 2) * 4);
      ctx.rotate(Math.sin(time * 1.8) * 0.1);
      ctx.fillText('?', 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  EyeSimulation.prototype.draw = function (ctx) {
    var frame = this.lastFrame;
    if (!frame) return;
    var pose = frame.pose;
    var blink = frame.blink;
    var alive = frame.alive;
    var t = this.elapsed;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.translate(this.layout.centerX, this.layout.centerY);
    ctx.scale(this.scale, this.scale * this.layout.stretchY);

    ctx.save();
    ctx.translate(pose.gazeX, pose.gazeY * this.layout.gazeScaleY);
    ctx.rotate(pose.tilt);
    ctx.scale(1 + frame.bounce, 1 - frame.bounce);
    var breathe = alive ? Math.sin(t * 1.4) * 0.006 * this.energy : 0;
    var sides = ['l', 'r'];
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i];
      var geometry = getEyeGeometry(pose, side, blink, breathe);
      var width = geometry.width;
      var height = geometry.height;
      var bend = geometry.bend;
      ctx.save();
      ctx.translate(pose[side + 'x'], pose[side + 'y']);
      ctx.rotate(pose[side + 'r']);
      eyePath(ctx, width, height, bend);
      var surface = ctx.createLinearGradient(0, -height / 2 - bend, 0, height / 2);
      surface.addColorStop(0, '#9e66e5');
      surface.addColorStop(0.55, '#9256e0');
      surface.addColorStop(1, '#8c50d9');
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.save();
      ctx.clip();
      drawLight(ctx, this, pose, width, height, bend, side, this.lightTime, blink);
      ctx.restore();
      ctx.restore();
    }
    drawAccents(ctx, pose, alive ? t : 0);
    ctx.restore();
    ctx.restore();
  };

  function createSimulation(options) {
    return new EyeSimulation(options);
  }

  var api = {
    EMOTIONS: EMOTIONS,
    Spring: Spring,
    EyeSimulation: EyeSimulation,
    createSimulation: createSimulation,
    getPose: getPose,
    getLayout: getLayout,
    getPointerGaze: getPointerGaze,
    getAttentionPose: getAttentionPose,
    getEyeGeometry: getEyeGeometry,
    eyePath: eyePath,
    getLight: getLight,
    getLightGeometry: getLightGeometry,
    getLightFragments: getLightFragments,
    attentionEnvelope: attentionEnvelope,
    getAmbientGaze: getAmbientGaze,
    blinkAmount: blinkAmount,
    drawLight: drawLight,
    drawAccents: drawAccents,
  };
  if (typeof globalThis !== 'undefined') globalThis.EyesCore = api;
  return api;
})();
