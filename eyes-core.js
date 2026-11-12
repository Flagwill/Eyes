/*
 * Shared Eyes eye engine.
 *
 * This file is deliberately a classic JavaScript library so the browser
 * wrapper in eyes.js and Plasma's QML JavaScript engine can both load it.
 */
var EyesCore = (function () {
  var Rig = typeof SentientEyeRig !== 'undefined' ? SentientEyeRig
    : globalThis.SentientEyeRig;
  if (!Rig) throw new Error('Load the Sentient Eye Engine rig before EyesCore');
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

  // Activity is intent, emotion is mood. Both use the same continuous rig.
  var ACTIVITIES = [
    {id:'listening', base:'idle', group:'理解', name:'竖起耳朵', short:'听任务', description:'收到，我在认真听你说。'},
    {id:'planning', base:'thinking', group:'理解', name:'排排小计划', short:'做计划', description:'先想清楚，再把每一步排好。'},
    {id:'reading', base:'focused', group:'理解', name:'逐行读一读', short:'读文件', description:'从这一行看到下一行，线索藏在哪里？'},
    {id:'searching', base:'curious', group:'理解', name:'探头找线索', short:'找资料', description:'左边看看，右边找找，有发现就带回来。'},
    {id:'creating', base:'curious', group:'动手', name:'新点子落纸', short:'创建', description:'一张新纸，一个想法，开始创造！'},
    {id:'editing', base:'focused', group:'动手', name:'埋头改一改', short:'编辑', description:'这里添一笔，那里改一点，再仔细看看。'},
    {id:'running', base:'focused', group:'动手', name:'盯住小终端', short:'跑命令', description:'命令出发，盯住输出，等它带回消息。'},
    {id:'mcp', base:'curious', group:'协作', name:'连上线了吗', short:'用 MCP', description:'伸出一条小连接，和远处的工具碰个头。'},
    {id:'tool', base:'focused', group:'协作', name:'拿出小扳手', short:'调工具', description:'找到合适的工具，认真拧好这一小步。'},
    {id:'skill', base:'thinking', group:'协作', name:'翻开拿手好戏', short:'用 skill', description:'翻开小手册，这一招我会！'},
    {id:'testing', base:'focused', group:'检查', name:'一项项打勾', short:'跑测试', description:'检查左边，再检查右边，每一项都算数。'},
    {id:'debugging', base:'confused', group:'检查', name:'揪出小问题', short:'排错误', description:'唔？凑近一点，看看是哪一环不对劲。'},
    {id:'reviewing', base:'thinking', group:'检查', name:'回头审一遍', short:'做审查', description:'换个角度再看一遍，让结果更可靠。'},
    {id:'saving', base:'focused', group:'收尾', name:'稳稳收进盒子', short:'保存', description:'收好这一份成果，轻轻放稳。'},
    {id:'delegating', base:'curious', group:'协作', name:'分头去看看', short:'分派', description:'这边交给你，那边交给我，回头碰头！'},
    {id:'waiting', base:'idle', group:'暂停', name:'等你的小点头', short:'等回应', description:'我在听，等你准备好了我们再继续。'},
    {id:'blocked', base:'confused', group:'暂停', name:'这里卡住啦', short:'遇阻', description:'碰到一个小障碍，需要换条路或请你帮忙。'},
    {id:'retrying', base:'focused', group:'暂停', name:'打起精神再试', short:'再试试', description:'记住刚才的线索，重新来一次。'},
    {id:'summarizing', base:'thinking', group:'收尾', name:'把线索串起来', short:'写总结', description:'把做过的事和重要发现，好好讲给你听。'},
    {id:'complete', base:'happy', group:'收尾', name:'好耶，完成啦', short:'完成', description:'完成啦！这份成果，一起收下。'},
  ];
  var EXPRESSIONS = EMOTIONS.concat(ACTIVITIES);
  var RIVE_VARIANTS = ['still', 'act', 'entry', 'follow', 'resolve'];
  // Rive input names are fixed; build them once instead of concatenating and
  // interning 140 strings in every simulation frame.
  var RIVE_VARIANT_KEYS = EXPRESSIONS.map(function (expression) {
    return RIVE_VARIANTS.map(function (variant) { return expression.id + variant; });
  });

  var BASE = {
    lx: -112, ly: 0, lw: 146, lh: 136, lr: 0,
    la: 0, lu: 1.2, ld: -0.6, luc: 3.4, llc: -1.4,
    lu1: 0, lu3: 0, ld1: 0, ld3: 0,
    rx: 112, ry: 0, rw: 146, rh: 136, rr: 0,
    ra: 0, ru: -1.2, rd: 0.6, ruc: 3.4, rlc: -1.4,
    ru1: 0, ru3: 0, rd1: 0, rd3: 0,
    tilt: 0, gazeX: 0, gazeY: 0, glow: 0.5,
    lightX: -0.08, lightY: -0.22, lightStrength: 0.16, lightSpread: 0.68,
    lightHeight: 0.56, lightBias: 0, lightBreath: 0.012,
    thinking: 0, happy: 0, curious: 0, focused: 0, surprised: 0, sleepy: 0, confused: 0,
    propA: 0, propB: 0, propC: 0,
  };

  var POSES = {
    idle: {lh: 134, rh: 134, ly: 1, ry: 1, luc: 8, ruc: 8, llc: -3, rlc: -3},
    happy: {
      lw: 154, rw: 154, lh: 32, rh: 32, ly: -6, ry: -6,
      lx: -109, rx: 109, la: 34, ra: 34,
      luc: 0, llc: 0, ruc: 0, rlc: 0, happy: 1, glow: 0.8,
      lu: 0, ld: 0, ru: 0, rd: 0,
      lu1: 0, lu3: 0, ld1: 0, ld3: 0,
      ru1: 0, ru3: 0, rd1: 0, rd3: 0,
      lightX: 0, lightY: -0.14, lightStrength: 0.18,
      lightSpread: 0.76, lightHeight: 0.5,
    },
    curious: {
      lx: -109, rx: 109, lw: 144, lh: 106, ly: 4,
      lu: 3, ld: -1, luc: 3, llc: -2.5,
      rw: 150, rh: 140, ry: 0, ru: -2.5, rd: 1, ruc: 10.8, rlc: -4.5,
      lu1: 0.4, lu3: 0.4, ld1: 0.5, ld3: 0,
      ru1: 0, ru3: 0, rd1: 0.5, rd3: 0.5,
      tilt: 0.013, curious: 1, glow: 0.65, lightX: -0.06, lightY: -0.24,
      lightStrength: 0.17, lightSpread: 0.68,
      lightHeight: 0.58, lightBias: 0.05,
    },
    thinking: {
      lw: 150, rw: 150, lh: 64, rh: 82, ly: 19, ry: 11,
      lu: 4, ld: -1, luc: -9, llc: 1,
      ru: 2, rd: 0.5, ruc: -5.5, rlc: -1.5,
      lu1: -1.2, lu3: 2, ld1: -0.5, ld3: -0.5,
      ru1: -0.4, ru3: 1.2, rd1: 0.3, rd3: 0,
      gazeX: 18, gazeY: -13, thinking: 1, glow: 0.65,
      lightX: 0.08, lightY: -0.3, lightStrength: 0.14,
      lightSpread: 0.6, lightHeight: 0.48, lightBreath: 0.008,
    },
    focused: {
      lw: 154, rw: 154, lh: 68, rh: 68, lx: -108, rx: 108, ly: 16, ry: 16,
      lu: 10, ld: -1, luc: -8, llc: 3,
      ru: -10, rd: 1, ruc: -8, rlc: 3,
      lu1: -0.3, lu3: 0.8, ld1: 0, ld3: -0.3,
      ru1: 0.8, ru3: -0.3, rd1: -0.3, rd3: 0,
      focused: 1, glow: 0.7, lightX: 0, lightY: -0.24,
      lightStrength: 0.13, lightSpread: 0.76,
      lightHeight: 0.38, lightBreath: 0.004,
    },
    surprised: {
      lh: 158, rh: 158, lw: 150, rw: 150, lx: -119, rx: 119,
      ly: -2, ry: -2, lu: 0.8, ld: -0.5, luc: 12, llc: -10,
      ru: -0.8, rd: 0.5, ruc: 12, rlc: -10,
      lu1: -1, lu3: -1, ld1: 1, ld3: 1,
      ru1: -1, ru3: -1, rd1: 1, rd3: 1,
      surprised: 1, glow: 0.9,
      lightX: -0.04, lightY: -0.2, lightStrength: 0.18,
      lightSpread: 0.72, lightHeight: 0.64,
    },
    sleepy: {
      lh: 32, rh: 32, lw: 148, rw: 148, ly: 28, ry: 28,
      lu: -2, ld: 0.5, luc: -4.5, llc: 1.8,
      ru: 2, rd: -0.5, ruc: -4.5, rlc: 1.8,
      lu1: 0, lu3: 0, ld1: -0.5, ld3: -0.5,
      ru1: 0, ru3: 0, rd1: -0.5, rd3: -0.5,
      sleepy: 1, glow: 0.2,
      lightX: -0.06, lightY: -0.12, lightStrength: 0.08,
      lightSpread: 0.72, lightHeight: 0.38, lightBreath: 0.008,
    },
    confused: {
      lw: 144, rw: 144, lh: 112, rh: 66, ly: -3, ry: 19,
      lu: -8, ld: 1.2, luc: 10, llc: -3,
      ru: -11, rd: 2, ruc: -6, rlc: 2.8,
      lu1: 1.5, lu3: 1, ld1: 0.5, ld3: 0,
      ru1: -1, ru3: -1, rd1: -0.3, rd3: 0.5,
      tilt: 0.014, confused: 1, glow: 0.45,
      lightX: -0.06, lightY: -0.2, lightStrength: 0.14,
      lightSpread: 0.66, lightHeight: 0.54, lightBias: -0.05,
    },
  };

  // Held cues stay readable even when natural motion is disabled.
  var ACTIVITY_POSES = {
    listening:{lh:128,rh:140,ly:0,ry:-3,gazeX:0,gazeY:-3,luc:8,ruc:11},
    planning:{lh:76,rh:96,ly:13,ry:7,gazeX:-16,gazeY:-14,lu:3,ru:-1},
    reading:{lw:148,rw:148,lh:82,rh:80,ly:18,ry:19,lu:2,ru:-2,luc:-8,ruc:-8,llc:6,rlc:6,gazeX:-10,gazeY:16},
    searching:{lh:120,rh:145,ly:1,ry:-2,gazeX:10,gazeY:2,tilt:-.008},
    creating:{lh:108,rh:120,ly:-5,ry:-9,la:10,ra:10,luc:5,ruc:7,gazeX:7,gazeY:12,tilt:.006},
    editing:{lh:60,rh:76,ly:21,ry:16,lu:6,ru:-5,luc:-8,ruc:-6,llc:4,rlc:4,gazeX:10,gazeY:17},
    running:{lh:72,rh:78,ly:15,ry:13,lu:7,ru:-7,gazeX:0,gazeY:15,lx:-110,rx:110},
    mcp:{lh:104,rh:132,ly:5,ry:-4,lu:2,ru:-1,gazeX:-8,gazeY:12,tilt:.01},
    tool:{lh:78,rh:70,ly:13,ry:17,lx:-106,rx:106,gazeX:5,gazeY:7},
    skill:{lh:88,rh:112,ly:9,ry:0,lu:3,ru:-3,luc:2,ruc:6,gazeX:-5,gazeY:15},
    testing:{lh:86,rh:86,ly:11,ry:11,lu:5,ru:-5,luc:-3,ruc:-3,gazeX:-8,gazeY:5},
    debugging:{lh:96,rh:54,ly:2,ry:24,lu:-5,ru:-8,luc:6,ruc:-6,gazeX:13,gazeY:4,tilt:-.012},
    reviewing:{lh:90,rh:76,ly:8,ry:15,lu:-2,ru:3,luc:-6,ruc:-7,llc:3,rlc:-4,gazeX:-13,gazeY:4},
    saving:{lh:58,rh:58,ly:23,ry:23,lu:3,ru:-3,luc:-8,ruc:-8,llc:3,rlc:3,gazeX:0,gazeY:13,lx:-104,rx:104},
    delegating:{lh:126,rh:110,ly:-4,ry:3,lu:-1,ru:-3,gazeX:-19,gazeY:-6,tilt:-.009},
    waiting:{lh:108,rh:112,ly:7,ry:5,luc:7,ruc:8,gazeX:0,gazeY:-2,lightStrength:.12},
    blocked:{lh:98,rh:72,ly:3,ry:17,lu:-10,ru:8,luc:3,ruc:-3,gazeX:0,gazeY:2,tilt:-.008},
    retrying:{lh:94,rh:88,ly:8,ry:11,lu:7,ru:-7,luc:0,ruc:0,gazeX:-9,gazeY:-3},
    summarizing:{lh:96,rh:94,ly:7,ry:8,lu:1,ru:-1,luc:7,ruc:7,llc:-4,rlc:-4,gazeX:0,gazeY:7},
    complete:{},
  };
  for (var activity of ACTIVITIES) {
    BASE['activity' + activity.id] = 0;
    var activityPose = clone(POSES[activity.base]);
    // Props identify intent; keep the inherited emotion's extra symbols quiet.
    for (var mood of EMOTIONS) if (mood.id !== 'idle') activityPose[mood.id] = 0;
    if (activity.id === 'complete') activityPose.happy = 1;
    if (activity.id === 'tool' || activity.id === 'editing') activityPose.focused = .5;
    for (var parameter in ACTIVITY_POSES[activity.id])
      activityPose[parameter] = ACTIVITY_POSES[activity.id][parameter];
    activityPose['activity' + activity.id] = 1;
    POSES[activity.id] = activityPose;
  }

  function getActivity(id) {
    for (var activity of ACTIVITIES) if (activity.id === id) return activity;
    throw new RangeError('Unknown activity: ' + id);
  }

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
    // The near eye opens a little while the far eye narrows. Keep this below
    // one unit so cursor attention shades the expression instead of replacing it.
    var lookUp = Math.max(0, -y);
    var lookDown = Math.max(0, y);
    var tension = 1 - pose.happy;
    result.luc += (-x * 0.65 + lookUp * 0.32 - lookDown * 0.24) * tension;
    result.llc += (x * 0.48 - lookUp * 0.28 + lookDown * 0.2) * tension;
    result.ruc += (x * 0.65 + lookUp * 0.32 - lookDown * 0.24) * tension;
    result.rlc += (-x * 0.48 - lookUp * 0.28 + lookDown * 0.2) * tension;
    result.lu3 += x * 0.9 * tension;
    result.ru1 -= x * 0.9 * tension;
    return result;
  }

  // One face plane carries eyes, clipped lights and accessories. Positive yaw
  // brings the left edge toward the viewer, as the gaze turns right. Keep the
  // camera in model units so perspective is independent of display size/DPR.
  function getFaceTarget(pose) {
    function limit(value, bound) { return Math.max(-bound, Math.min(bound, value)); }
    return {
      yaw: limit(pose.gazeX / 40 * .34 + pose.curious * .025 - pose.confused * .045, .38),
      pitch: limit(pose.gazeY / 28 * .24 + pose.sleepy * .075 - pose.happy * .065 - pose.surprised * .055, .28),
    };
  }

  function getFaceMatrix(yaw, pitch, roll, scale) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(-pitch);
    var cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
    // Project Ry * Rx(-pitch) * Rz onto z=0. The model uses screen y-down
    // while the rotation basis is y-up, so positive pitch (gaze down) must
    // invert to bring the top edge toward the viewer. Flattening the output
    // depth avoids Qt's implicit camera and CSS clipping disagreeing;
    // homogeneous w retains the true perspective division. Row-major,
    // matching Qt.matrix4x4. An optional uniform scale (the mood's lean
    // toward the viewer) multiplies only the screen rows, so the pivot and
    // perspective division stay put.
    var k = scale === undefined ? 1 : scale;
    return [k*(cy*cr+sy*sp*sr), k*(-cy*sr+sy*sp*cr), 0, 0,
      k*cp*sr, k*cp*cr, 0, 0,
      0, 0, 1, 0,
      (sy*cr-cy*sp*sr)/850, (-sy*sr-cy*sp*cr)/850, 0, 1];
  }

  function getFaceScreenMatrix(face, layout) {
    var m = face.matrix.slice(), sx = Math.max(.0001, layout.scale);
    var sy = sx * layout.stretchY;
    m[1] *= sx / sy; m[4] *= sy / sx;
    m[12] /= sx; m[13] /= sy;
    return m;
  }

  function applyFaceProjection(canvas, simulation) {
    if (!canvas || !canvas.style || !simulation.lastFrame) return;
    var frame = simulation.lastFrame, layout = simulation.layout;
    var matrix = getFaceScreenMatrix(frame.face, layout);
    // CSS takes column-major order. The origin follows gaze translation but
    // never feeds back into the layout or pointer coordinate system.
    var css = [];
    for (var col = 0; col < 4; col++) for (var row = 0; row < 4; row++) css.push(matrix[row*4+col]);
    canvas.style.transformOrigin = (layout.centerX + layout.scale*frame.pose.gazeX) + 'px ' +
      (layout.centerY + layout.scale*layout.stretchY*frame.pose.gazeY*layout.gazeScaleY) + 'px';
    canvas.style.transform = 'matrix3d(' + css.join(',') + ')';
  }

  function getEyeGeometry(pose, side, blink, breathe) {
    var geometry = {
      width: Math.max(30, pose[side + 'w'] * (1 + breathe + blink * 0.025)),
      height: Math.max(6, pose[side + 'h'] * (1 - breathe)) * (1 - blink * 0.96),
      upperBend: (pose[side + 'a'] + pose[side + 'uc']) * (1 - blink),
      lowerBend: (pose[side + 'a'] + pose[side + 'lc']) * (1 - blink),
      upperSlope: pose[side + 'u'] * (1 - blink),
      lowerSlope: pose[side + 'd'] * (1 - blink),
      // The upper lid travels farther; closing must not squash around the centre.
      offsetY: pose[side + 'h'] * (1 - breathe) * blink * 0.22,
    };
    var upper = [], lower = [];
    for (var i = 0; i < 5; ++i) {
      var u = i / 2 - 1;
      var upperNode = (i === 1 || i === 3) ? pose[side + 'u' + i] * (1 - blink) : 0;
      var lowerNode = (i === 1 || i === 3) ? pose[side + 'd' + i] * (1 - blink) : 0;
      upper.push(-geometry.height / 2 - geometry.upperBend * (1 - u * u) +
        geometry.upperSlope * u + upperNode);
      lower.push(geometry.height / 2 - geometry.lowerBend * (1 - u * u) +
        geometry.lowerSlope * u + lowerNode);
    }
    geometry.upper = Rig.compileSmooth(upper,
      geometry.upperSlope / 2 - geometry.upperBend,
      geometry.upperSlope / 2 + geometry.upperBend);
    geometry.lower = Rig.compileSmooth(lower,
      geometry.lowerSlope / 2 - geometry.lowerBend,
      geometry.lowerSlope / 2 + geometry.lowerBend);
    geometry.extent = Math.max.apply(null, upper.concat(lower).map(Math.abs)) + 3;
    return geometry;
  }

  function eyePath(ctx, geometry) {
    Rig.trace(ctx, geometry);
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
      strength: clamp(pose.lightStrength * (1 + asymmetry) * breath + cue * 0.008, 0, 0.24),
      kind: 0,
    };
  }

  function getLightGeometry(light, eye) {
    var edge = Rig.edges(eye, light.x);
    var center = Rig.surfacePoint(eye, light.x, light.y);
    var upperSlope = Rig.slope(eye.upper, light.x, eye.width);
    var lowerSlope = Rig.slope(eye.lower, light.x, eye.width);
    return {
      x: center.x, y: center.y,
      width: eye.width * light.spread,
      height: (edge.lower - edge.upper) * light.height,
      slope: (upperSlope + lowerSlope + light.y * (lowerSlope - upperSlope)) * 0.5,
    };
  }

  function getLightFragments(pose, time, side) {
    var main = getLight(pose, 0, side);
    var calm = (1 - pose.sleepy * 0.65) * Math.min(1, pose.lightHeight / 0.42);
    var strength = (0.024 + pose.happy * 0.003 + pose.curious * 0.002) * calm;
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
        kind: 1,
      });
    }
    return fragments;
  }

  function ease(value) {
    var t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }

  function beat(time, start, attack, hold, release) {
    function settle(value) {
      var t = Math.max(0, Math.min(1, value));
      return Math.max(0, Math.min(1, t * t * t * (t * (t * 6 - 15) + 10)));
    }
    return settle((time - start) / attack) *
      (1 - settle((time - start - attack - hold) / release));
  }

  // Small corrections around a held target, separated by genuinely still holds.
  // These are art-directed acting beats, not a physiological frequency model.
  function getFixationMotion(emotion, time) {
    var t = time % 29.7;
    var a = beat(t, 2.7, 0.11, 0.52, 0.24);
    var b = beat(t, 8.9, 0.13, 0.38, 0.28);
    var c = beat(t, 14.6, 0.10, 0.65, 0.26);
    var d = beat(t, 22.8, 0.14, 0.42, 0.3);
    var restraint = emotion === 'focused' ? 0.28 : emotion === 'sleepy' ? 0.45 : 1;
    var idleGain = emotion === 'idle' ? 1.65 : 1;
    return {
      x: (a * 0.85 - b * 0.7 + c * 0.55 - d * 0.8) * restraint * idleGain,
      y: (-a * 0.32 + b * 0.24 + c * 0.3 - d * 0.2) * restraint * idleGain,
      lid: beat(t, 18.2, 0.28, 0.18, 0.65) * 0.025 * restraint *
        (emotion === 'idle' ? 1.55 : 1),
    };
  }

  function motionPose() {
    return {lift: 0, open: 0, asymmetry: 0, tilt: 0, bend: 0,
      width: 0,
      upperBend: 0, lowerBend: 0, leftTension: 0, rightTension: 0,
      leftLift: 0, rightLift: 0, leftSlope: 0, rightSlope: 0, spacing: 0,
      propA: 0, propB: 0, propC: 0};
  }

  var ACTIVITY_SCORES;

  function entryEnvelope(emotion, age) {
    if (ACTIVITY_SCORES[emotion]) {
      var entry = ACTIVITY_SCORES[emotion].entryTiming || [.28,.22,.95];
      return beat(age,0,entry[0],entry[1],entry[2]);
    }
    var timing = {idle: [0.4, 0.2, 0.9], happy: [0.18, 0.18, 0.9],
      curious: [0.26, 0.24, 1.05], thinking: [0.4, 0.25, 1.0],
      focused: [0.34, 0.18, 0.8], surprised: [0.12, 0.16, 0.85],
      sleepy: [0.85, 0.25, 1.2], confused: [0.3, 0.3, 1.15]}[emotion];
    return beat(age, 0, timing[0], timing[1], timing[2]);
  }

  function entryMotion(emotion) {
    var result = motionPose();
    var cues = ACTIVITY_SCORES[emotion] ? ACTIVITY_SCORES[emotion].entry : {
      idle: {open: 0.04, lift: -1, upperBend: 0.7},
      happy: {bend: 9, lift: -7, leftLift: -0.6, rightLift: -1.5, spacing: -2},
      curious: {open: 0.025, asymmetry: 0.035, rightTension: 2.5,
        leftTension: -0.8, rightLift: -2, leftLift: -1.5, tilt: 0.006},
      thinking: {open: -0.09, upperBend: -2, lowerBend: 0.6,
        leftTension: -1.3, rightTension: -0.4},
      focused: {open: -0.065, upperBend: -1.4, lowerBend: 0.45, lift: 1, spacing: -1.5},
      surprised: {open: 0.04, upperBend: 2.2, lowerBend: -1.8, lift: -1, spacing: 2},
      sleepy: {open: -0.13, lift: 2, upperBend: -0.8, lowerBend: 0.35},
      confused: {asymmetry: -0.05, leftTension: 2, rightTension: -2,
        leftLift: -1, rightLift: 2, tilt: -0.009},
    }[emotion];
    for (var key in cues) result[key] = cues[key];
    return result;
  }

  function getExpressionAccent(emotion, age) {
    var result = entryMotion(emotion), weight = entryEnvelope(emotion, age);
    for (var key in result) result[key] *= weight;
    return result;
  }

  // Three complementary gestures per emotion. They share their clock with gaze
  // and are mixed by springs, so entering a state cannot land halfway through
  // an unrelated Rive timeline. Values are deltas from the held expression.
  var GESTURES = {
    idle: [
      // The three idle poses are mixed as one slow, continuous breath rather
      // than three isolated beats. The widened inhale is answered by a softer,
      // slightly lower exhale; the last pose adds a small organic weight shift.
      {open:.13, width:.014, lift:-1.35, upperBend:2.1, lowerBend:-.55,
        spacing:.55, leftTension:.25, rightTension:-.15},
      {open:-.085, width:-.007, lift:.72, upperBend:-1.05, lowerBend:.38,
        spacing:-.3},
      {leftLift:.55, rightLift:-.72, leftTension:.7, rightTension:-.55,
        asymmetry:.006, tilt:-.0022}],
    happy: [
      // A small head tilt as the smile deepens, rocking back the other way on
      // the later lift; roll only reaches the face matrix, never the lids.
      {bend:6.5, lift:-3.5, spacing:-1.3, tilt:.018},
      {bend:3.5, leftLift:-1.8, tilt:-.012},
      {rightLift:-2.5}],
    curious: [
      {open:.03, asymmetry:.055, rightTension:2.8, leftTension:-1.5,
        rightLift:-2.3, tilt:.014},
      {open:.025, asymmetry:-.025, leftTension:1.7, leftLift:-2},
      {open:-.075, asymmetry:.025, rightTension:-.7, leftTension:-.8,
        upperBend:-1.6, lowerBend:.5, leftSlope:3, rightSlope:-2.2,
        tilt:-.004, spacing:-1.5}],
    thinking: [
      // Pondering cocks the head away from the raised gaze, then back as
      // one side relaxes. Roll reaches the face matrix only.
      {open:-.105, upperBend:-2.8, lowerBend:.3, leftTension:-1.5,
        leftLift:1.2, leftSlope:2.2, rightSlope:-.8, tilt:-.011},
      {open:.065, upperBend:1.5, rightTension:1.8, rightLift:-2.4, tilt:.007},
      {open:.025, leftLift:-.8, rightLift:-1.4, leftTension:.8, rightTension:1.6, spacing:-.5}],
    focused: [
      {open:-.028, upperBend:-.55, lowerBend:.2, spacing:-.6},
      {open:.018, upperBend:.25},
      {upperBend:-.65, lowerBend:.15, rightLift:-.4}],
    surprised: [
      {open:.035, upperBend:2.5, lowerBend:-1.8, lift:-1.5, spacing:.8},
      {open:-.045, upperBend:-.8, lowerBend:.5},
      {asymmetry:.035, rightLift:-1.2, leftTension:-.4, rightTension:1.2,
        leftSlope:-1.5, rightSlope:1.5}],
    sleepy: [
      {open:-.16, asymmetry:.06, leftLift:1.6, upperBend:-.3, lowerBend:.15},
      {open:-.16, asymmetry:-.06, rightLift:2.1, upperBend:-.3, lowerBend:.15},
      {open:.08, upperBend:.65, lowerBend:-.25, lift:-.8}],
    confused: [
      {asymmetry:-.045, leftTension:3, leftLift:-3, leftSlope:-2, rightSlope:-.8, tilt:-.01},
      {rightTension:-3.2, rightLift:1.1, rightSlope:-2.5},
      {asymmetry:.055, leftTension:-1.4, rightTension:2.1,
        leftLift:1.5, rightLift:-2, leftSlope:1.8, rightSlope:4, tilt:.008}],
  };

  // Three readable beats: intention, partner response, resolution. Gaze and
  // props follow these same poses, with held gaps instead of perpetual bobbing.
  ACTIVITY_SCORES = {
    listening:{entry:{open:.07,lift:-2}, gestures:[{rightLift:-2,rightTension:1.6},
      {leftLift:-1.5,open:.025},{lift:1,open:-.025}], gaze:[[4,-3],[-3,0],[0,1]], duration:12.8},
    planning:{entry:{open:-.06,leftTension:-1.5}, gestures:[{leftSlope:3,leftLift:1,open:-.06},
      {rightLift:-3,rightTension:2},{open:.045,lift:-1}], gaze:[[-5,-2],[6,0],[1,2]], duration:13.6},
    reading:{entry:{lift:1,open:-.04}, gestures:[{leftSlope:1,rightSlope:1},
      {rightLift:-1,open:.025},{lift:1,open:-.035}], gaze:[[15,0],[24,1],[-5,3]],
      timing:[[.8,.55,.75,.55],[2.9,.6,.65,.6],[5.1,.4,.5,.65]],duration:8.5},
    searching:{entry:{rightLift:-3,asymmetry:.04}, gestures:[{leftLift:-3,asymmetry:-.06,tilt:-.008},
      {rightLift:-3,asymmetry:.05,tilt:.009},{open:-.06,upperBend:-1}], gaze:[[-7,1],[25,-1],[8,4]],duration:10.4},
    creating:{entry:{lift:-4,open:.08,spacing:1}, gestures:[{rightLift:-3,upperBend:2,open:.05},
      {leftLift:-2,upperBend:1},{lift:-2,bend:3,spacing:-1}], gaze:[[5,3],[0,5],[-3,-2]],duration:10.8},
    editing:{entry:{open:-.055,lift:1}, gestures:[{leftLift:1,rightTension:-.8},
      {rightLift:1,leftSlope:1.5},{open:.065,rightLift:-2}], gaze:[[8,3],[-6,5],[0,-11]],
      timing:[[.7,.3,.4,.5],[1.8,.3,.45,.55],[4,.4,.65,.8]],duration:7.6},
    running:{entry:{open:-.07,spacing:-1}, gestures:[{open:-.035,rightTension:-.8},
      {rightLift:-2,open:.06},{lift:1,open:-.02}], gaze:[[-2,2],[4,-2],[-5,3]],duration:10.5},
    mcp:{entry:{rightLift:-4,asymmetry:.06,spacing:1.5}, gestures:[{rightLift:-3,rightTension:2,spacing:1},
      {leftLift:-3,leftTension:1.7},{spacing:-1.5,open:-.045}], gaze:[[-7,0],[17,0],[8,-4]],
      timing:[[1,.4,.6,.9],[1.3,.45,.65,1],[4.7,.55,.6,1]],duration:10.9},
    tool:{entry:{open:-.065,spacing:-1.5}, gestures:[{leftLift:1,rightLift:-1,leftSlope:2},
      {leftLift:-1,rightLift:1,rightSlope:-2},{lift:1.5,open:.035}], gaze:[[-3,1],[3,1],[0,-3]],duration:9.6},
    skill:{entry:{open:.09,rightLift:-2}, gestures:[{open:.06,rightTension:2},
      {leftLift:-2,upperBend:1},{open:-.045,lift:1}], gaze:[[-6,2],[10,0],[5,-10]],duration:12.1},
    testing:{entry:{open:-.035,lift:-1}, gestures:[{leftLift:-2,leftTension:1},
      {rightLift:-2,rightTension:1},{lift:2,open:-.04}], gaze:[[-6,0],[16,0],[0,3]],
      timing:[[1,.35,.55,.75],[2.8,.35,.55,.75],[4.8,.35,.35,.8]],duration:9.2},
    debugging:{entry:{asymmetry:-.045,leftSlope:-2}, gestures:[{open:-.065,rightTension:-2},
      {leftLift:-2,leftTension:1.5},{rightLift:-3,open:.08,tilt:.006}], gaze:[[-6,1],[3,-2],[-7,-4]],duration:11.4},
    reviewing:{entry:{open:-.04,leftSlope:-2}, gestures:[{leftLift:-1,asymmetry:-.035},
      {rightLift:-2,asymmetry:.04},{lift:1.8,open:.03}], gaze:[[-5,0],[24,1],[8,3]],duration:12.5},
    saving:{entry:{spacing:-2,open:-.04}, gestures:[{lift:2.5,open:-.07},
      {leftLift:1,rightLift:1},{open:.06,lift:-2,spacing:1}], gaze:[[0,3],[1,1],[0,-4]],duration:11.5},
    delegating:{entry:{leftLift:-3,open:.04,spacing:2}, gestures:[{leftLift:-2,leftTension:1.5,tilt:-.008},
      {rightLift:-3,rightTension:2,tilt:.008},{spacing:-1,open:-.035}], gaze:[[-6,0],[34,1],[16,3]],duration:12.2},
    waiting:{entry:{open:.025,lift:-1}, gestures:[{rightLift:-1.2,open:.02},
      {leftLift:-1},{open:-.025,lift:1}], gaze:[[6,-2],[-5,1],[0,-1.5]],
      timing:[[3,.8,.7,1.4],[9,.8,.6,1.5],[14,1,.5,1.5]],duration:19.5},
    blocked:{entry:{leftTension:1,rightTension:-1,tilt:-.006}, gestures:[{asymmetry:-.035,leftSlope:-2},
      {rightTension:-1,open:-.025},{leftLift:-1.5,rightLift:-1}], gaze:[[-3,0],[3,0],[0,-3]],duration:15.2},
    retrying:{entry:{open:-.1,lift:2}, gestures:[{leftLift:1,rightLift:1,open:-.045},
      {open:.08,lift:-3,spacing:1},{open:-.02,upperBend:-.5}], gaze:[[-7,1],[14,-3],[7,1]],duration:11.2},
    summarizing:{entry:{open:.045,lift:-1}, gestures:[{leftLift:-1,leftSlope:1},
      {rightLift:-1,rightSlope:-1},{spacing:-1.5,lift:1.5}], gaze:[[-9,0],[9,0],[0,-3]],duration:11.8},
    complete:{entry:{bend:9,lift:-7,spacing:-2},gestures:GESTURES.happy,
      gaze:[[0,-1],[2,0],[0,0]],duration:13.4,entryTiming:[.18,.18,.9]},
  };
  for (var activity of ACTIVITIES) {
    var score = ACTIVITY_SCORES[activity.id];
    score.gestures = score.gestures.map(clone);
    for (var i=0;i<3;i++) score.gestures[i]['prop' + ['A','B','C'][i]] = 1;
    GESTURES[activity.id] = score.gestures;
    score.entry.propC = -.5;
  }

  // Acting beats as [start, attack, hold, release]. Idle breathing and the
  // layered sleepy droops are shaped separately in getActingCues.
  var EMOTION_TIMING = {
    happy: [[.9,.38,.65,1.2],[6.2,.45,.35,1.25],[6.35,.45,.35,1.25]],
    curious: [[1.1,.32,.75,1.35],[1.32,.45,.7,1.4],[5.8,.5,1,1.3]],
    thinking: [[2.4,.65,.7,1.2],[8.4,.42,.45,1.6],[11.4,.34,.35,.85]],
    focused: [[4.6,.8,.4,1.5],[12.4,.45,.8,.9],[16,.5,.35,.9]],
    surprised: [[3.6,.28,.42,1.45],[5.4,.75,.65,1.25],[10.2,.22,.4,.9]],
    confused: [[1.5,.42,.9,1.1],[1.75,.55,.65,1.2],[7,.5,.7,1.4]],
  };
  var ACTIVITY_TIMING = [[1.1,.4,.65,.95],[3.4,.45,.6,1.1],[6.6,.5,.55,1.2]];

  function getCueTiming(emotion) {
    var score = ACTIVITY_SCORES[emotion];
    return score ? score.timing || ACTIVITY_TIMING : EMOTION_TIMING[emotion];
  }

  // Eyes lead the lids: a glance leaves with its acting beat but travels in
  // well under half the time, holds, and starts home as the lids begin to
  // release. Quick darts between held targets read as alert, not drifting.
  function dartBeat(time, start, attack, hold, release) {
    var travel = Math.max(0.12, attack * 0.42);
    return beat(time, start, travel, hold + attack - travel,
      Math.max(0.24, release * 0.42));
  }

  function getActingCues(emotion, time) {
    var t = time % getPerformanceDuration(emotion);
    if (emotion === 'idle') {
      // Three calm breaths per idle cycle (about 5.8 seconds each). A tiny
      // phase bend makes the inhale a little quicker than the release, while
      // the complementary weights keep the two lid poses within one blend.
      var duration = getPerformanceDuration('idle');
      var phase = (t % (duration / 3)) / (duration / 3);
      var warped = phase + .045 * Math.sin(phase * Math.PI * 2);
      var breath = .5 - .5 * Math.cos(warped * Math.PI * 2);
      var transition = 4 * breath * (1 - breath);
      return [breath * .86, (1 - breath) * .86, transition * .14];
    }
    if (emotion === 'sleepy') return [
      beat(t,SLEEPY_BEATS[0],2.2,.65,.7)+beat(t,SLEEPY_BEATS[0]+6.5,1.8,.4,.85)*.7,
      beat(t,SLEEPY_BEATS[1],2.2,.65,.7)+beat(t,SLEEPY_BEATS[1]+6.5,1.8,.4,.85)*.7,
      beat(t,SLEEPY_BEATS[2],.25,.35,.65)];
    return getCueTiming(emotion).map(function (cue) {
      return beat(t, cue[0], cue[1], cue[2], cue[3]);
    });
  }

  // The first onsets of the layered sleepy droops and of the wake-up start.
  var SLEEPY_BEATS = [3.3, 3.55, 13.3];

  // The same beats for the eyes alone. Drowsy eyes keep the slow lid timing,
  // and a pondering glance drifts with its lids (see MOOD_ACTING drift).
  function getGazeCues(emotion, time) {
    if (emotion === 'sleepy') return getActingCues(emotion, time);
    var t = time % getPerformanceDuration(emotion);
    var acting = MOOD_ACTING[emotion], drift = acting && acting.drift;
    return getCueTiming(emotion).map(function (cue, index) {
      return (drift && drift[index] ? beat : dartBeat)(t, cue[0], cue[1], cue[2], cue[3]);
    });
  }

  function getRestingMotion(emotion, time, cues) {
    cues = cues || getActingCues(emotion, time);
    var result = motionPose();
    for (var i=0; i<3; i++) for (var key in GESTURES[emotion][i])
      result[key] += GESTURES[emotion][i][key] * cues[i];
    return result;
  }

  function getPerformanceDuration(emotion) {
    if (ACTIVITY_SCORES[emotion]) return ACTIVITY_SCORES[emotion].duration;
    return {idle: 17.3, happy: 13.4, curious: 11.8, thinking: 14.2,
      focused: 18.7, surprised: 16.1, sleepy: 15.6, confused: 12.8}[emotion];
  }

  function applyMotion(pose, motion, weight) {
    for (var side of ['l', 'r']) {
      var left = side === 'l', tension = motion[left ? 'leftTension' : 'rightTension'];
      var oldHeight = pose[side + 'h'];
      pose[side + 'w'] *= 1 + motion.width * weight;
      pose[side + 'h'] *= 1 + (motion.open + (left ? -1 : 1) * motion.asymmetry +
        tension * 0.009) * weight;
      // Upper lids travel farther than lower lids during a thought or a droop.
      pose[side + 'y'] += (motion.lift + motion[left ? 'leftLift' : 'rightLift']) * weight +
        (oldHeight - pose[side + 'h']) * 0.32;
      pose[side + 'a'] += motion.bend * weight;
      pose[side + 'u'] += motion[left ? 'leftSlope' : 'rightSlope'] * weight;
      pose[side + 'uc'] += (motion.upperBend + tension) * weight;
      pose[side + 'lc'] += (motion.lowerBend - tension * 0.42) * weight;
      pose[side + 'u1'] -= tension * (left ? 0.45 : 0.8) * weight;
      pose[side + 'u3'] -= tension * (left ? 0.8 : 0.45) * weight;
    }
    pose.lx -= motion.spacing * weight;
    pose.rx += motion.spacing * weight;
    pose.tilt += motion.tilt * weight;
    pose.propA += motion.propA * weight;
    pose.propB += motion.propB * weight;
    pose.propC += motion.propC * weight;
    return pose;
  }

  function getPerformancePose(emotion, time) {
    return applyMotion(getPose(emotion), getRestingMotion(emotion, time), 1);
  }

  function getGesturePose(emotion, index) {
    var motion=motionPose(), profile=GESTURES[emotion][index];
    for (var key in profile) motion[key]=profile[key];
    return applyMotion(getPose(emotion),motion,2);
  }

  function getEntryPose(emotion) {
    return applyMotion(getPose(emotion), entryMotion(emotion), 1);
  }

  var INHALE_POSE;

  // The pose Rive bakes as `idleact`, reused as the wide look of the wake.
  function getInhalePose() {
    if (!INHALE_POSE) INHALE_POSE = getGesturePose('idle', 0);
    return INHALE_POSE;
  }

  function attentionEnvelope(elapsed) {
    if (elapsed < 0 || elapsed >= 0.68) return 0;
    return elapsed < 0.12
      ? ease(elapsed / 0.12)
      : 1 - ease((elapsed - 0.12) / 0.56);
  }

  // Idle keeps one quiet rhythm but varies where it looks, so a long session
  // does not replay the same loop. Each phrase is [x, y, head roll]; shift
  // nudges the first two glance onsets. Phrase 0 is the original right-up /
  // left-down pair, and every phrase is back at rest before its cycle ends.
  var IDLE_GLANCES = [
    {shift:[0,0], first:[10.5,-2.4,0], second:[-7.5,1.9,0], settle:[2.4,-1.2,0]},
    {shift:[.7,-.5], first:[-9.8,-3,-.012], second:[7.8,2,0], settle:[-1.9,-.7,0]},
    {shift:[-.4,.6], first:[2.7,-5.6,.014], second:[-8.5,1.5,0], settle:[2,-.5,0]},
    {shift:[1,.2], first:[8.5,2.7,0], second:[-9.2,-2.5,-.01], settle:[1.5,-1,0]},
  ];
  var IDLE_GLANCE_ORDER = [0,2,1,3,1,0,3,2];

  function getIdleGlance(time) {
    var duration = getPerformanceDuration('idle');
    var cycle = Math.floor(Math.max(0, time) / duration);
    var phrase = IDLE_GLANCES[IDLE_GLANCE_ORDER[cycle % IDLE_GLANCE_ORDER.length]];
    var t = time % duration;
    var weights = [dartBeat(t, 3.8 + phrase.shift[0], .32, 1.65, .95),
      dartBeat(t, 10.9 + phrase.shift[1], .38, 1.1, 1),
      dartBeat(t, 14.7, .6, .6, .9)];
    var targets = [phrase.first, phrase.second, phrase.settle], result = {x:0, y:0, roll:0};
    for (var i = 0; i < 3; i++) {
      result.x += targets[i][0] * weights[i];
      result.y += targets[i][1] * weights[i];
      result.roll += targets[i][2] * weights[i];
    }
    return result;
  }

  // A glance has a held target and a reason to return. Pointer attention still
  // takes priority, so these phrases never fight a real user's cursor.
  function getAmbientGaze(emotion, time) {
    if (emotion === 'idle') {
      var glance = getIdleGlance(time);
      return {x:glance.x, y:glance.y};
    }
    var cues = getGazeCues(emotion, time);
    var a=cues[0], b=cues[1], c=cues[2];
    if (ACTIVITY_SCORES[emotion]) {
      var targets=ACTIVITY_SCORES[emotion].gaze, gaze={x:0,y:0};
      for (var i=0;i<3;i++) { gaze.x+=targets[i][0]*cues[i]; gaze.y+=targets[i][1]*cues[i]; }
      return gaze;
    }
    if (!a && !b && !c) return {x:0,y:0};
    if (emotion === 'happy') return {x:b*4.5,y:-a*2.4};
    if (emotion === 'curious') return {x:a*10-c*8.5,y:-a*3.4+c*1.6};
    if (emotion === 'thinking') return {x:-a*10+b*4-c*2.4,y:a*2.8-b*2.4+c*1.6};
    if (emotion === 'focused') return {x:0,y:0};
    if (emotion === 'surprised') return {x:c*5.5,y:-a*2.2};
    if (emotion === 'sleepy') return {x:0,y:(a+b)*1.1-c*1.6};
    return {x:-a*6.2+c*7,y:-a*1.3+c*1};
  }

  // Ambient glances lean the head as a cursor glance does (see
  // getAttentionPose); some idle phrases add a small head cock.
  // Scaled by energy like every other natural motion.
  function getAmbientLean(emotion, time, energy) {
    energy = energy === undefined ? 1 : energy;
    var lean = Math.max(-1, Math.min(1, getAmbientGaze(emotion, time).x * energy / 40)) * 0.025;
    return emotion === 'idle' ? lean + getIdleGlance(time).roll * energy : lean;
  }

  // Signed squash and stretch when the mood changes: negative stretches
  // first (perks up), positive squashes first (settles in). Activities pop
  // more gently than emotions, because the harness reports them often.
  var POP_GAINS = {idle:-.45, happy:-1.3, curious:-.9, thinking:.5, focused:.6,
    surprised:-1.7, sleepy:.35, confused:.8};
  var POP_PERIOD = 0.36, POP_DECAY = 6, POP_SCALE = 0.02;

  function getPopGain(id) {
    if (POP_GAINS[id] !== undefined) return POP_GAINS[id];
    return id === 'complete' ? POP_GAINS.happy : POP_GAINS[getActivity(id).base] * .6;
  }

  // Each mood's body language around its baked lid poses. It reaches runtime
  // inputs only, so the Rive asset is unchanged:
  // - blink: [interval seconds, double-blink chance, duration scale];
  // - lean: uniform face scale toward (+) or away from (-) the viewer, and
  //   nod: extra face pitch (+ down), each listed for [entry, beat 0, 1, 2]
  //   at full energy and weighted by the same envelopes as the lids;
  // - drift: beats whose glance moves with the lids instead of darting;
  // - events: squash/stretch impulses and blinks on a beat onset (`at`
  //   seconds later); beat -1 is a one-off counted from the mood change.
  var MOOD_ACTING = {
    idle: {blink:[4.5,.16,1], lean:[0,.004,0,0], nod:[0,-.008,0,0]},
    happy: {blink:[5.2,.22,1], lean:[.01,.008,0,0], nod:[-.03,-.02,0,0],
      events:[{beat:0, pop:-.6}, {beat:0, at:.3, pop:-.4}, {beat:1, pop:-.45}]},
    curious: {blink:[5.4,.1,1], lean:[.01,.014,.006,.01], nod:[0,-.012,0,.015],
      events:[{beat:0, pop:-.5}]},
    thinking: {blink:[5.6,.12,1], lean:[-.006,-.008,0,.008], nod:[0,0,0,-.01],
      drift:[1,1,0], events:[{beat:2, pop:-.55, blink:.7}]},
    focused: {blink:[6.5,.06,.92], lean:[.008,.005,-.003,.004], nod:[.02,.01,0,0],
      events:[{beat:0, pop:.35}]},
    surprised: {blink:[4.2,.3,.9], lean:[-.016,-.008,.004,0], nod:[-.035,-.015,0,0],
      events:[{beat:-1, at:.88, blink:1, double:true}, {beat:0, pop:-.6}]},
    sleepy: {blink:[3.5,.16,1.65], lean:[-.008,-.006,-.006,.008], nod:[.04,.035,.035,-.04],
      events:[{beat:2, pop:-.8, blink:.8, double:true}]},
    confused: {blink:[4.6,.26,1], lean:[-.008,.01,0,-.006], nod:[.01,0,0,0],
      events:[{beat:0, pop:.45}, {beat:2, pop:-.4}]},
  };
  // Completion performs the happy gestures, so it borrows all of happy.
  MOOD_ACTING.complete = MOOD_ACTING.happy;
  var LEAN_LIMIT = 0.02, ACTIVITY_BODY_SHARE = 0.6;

  // A cursor is interesting while it moves. Once it has rested for `hold`
  // seconds the gaze goes back to the mood's own acting (the last position is
  // kept, never forgotten); when it moves again the eyes return to it with a
  // brief widened look. That look mixes in idle's baked inhale pose, as the
  // wake does, so it needs no Rive input of its own; its timing is
  // [start, attack, hold, release].
  var ATTENTION = {hold: 4, widen: 0.16, notice: [0, 0.14, 0.1, 0.45]};

  function getMood(id) {
    return MOOD_ACTING[id] ? id : getActivity(id).base;
  }

  // Other activities show their prop gestures, so they keep only the base
  // mood's blink habit and a softer arrival, like their softer pop.
  function getBodyActing(emotion, time, age, cues) {
    var own = MOOD_ACTING[emotion], acting = own || MOOD_ACTING[getMood(emotion)];
    var share = own ? 1 : ACTIVITY_BODY_SHARE, entry = entryEnvelope(emotion, age);
    var result = {lean: acting.lean[0] * entry, nod: acting.nod[0] * entry};
    if (own) {
      cues = cues || getActingCues(emotion, time);
      for (var i = 0; i < 3; i++) {
        result.lean += acting.lean[i + 1] * cues[i];
        result.nod += acting.nod[i + 1] * cues[i];
      }
    }
    result.lean *= share;
    result.nod *= share;
    return result;
  }

  var ACTING_EVENTS = {};

  function getActingEvents(emotion) {
    if (ACTING_EVENTS[emotion]) return ACTING_EVENTS[emotion];
    var acting = MOOD_ACTING[emotion], starts = emotion === 'sleepy' ? SLEEPY_BEATS
      : acting && acting.events ? getCueTiming(emotion).map(function (cue) { return cue[0]; }) : [];
    ACTING_EVENTS[emotion] = (acting && acting.events || []).map(function (event) {
      return {at: (event.beat < 0 ? 0 : starts[event.beat]) + (event.at || 0),
        once: event.beat < 0, pop: event.pop || 0, blink: event.blink || 0,
        double: Boolean(event.double)};
    });
    return ACTING_EVENTS[emotion];
  }

  // Whether a looping cue at `at` falls in (previous, current] of performance
  // time; one-off cues only count in the first cycle.
  function cueCrossed(previous, current, at, duration, once) {
    if (once) return previous < at && at <= current;
    for (var cycle = Math.floor(previous / duration); cycle <= Math.floor(current / duration); cycle++) {
      var time = cycle * duration + at;
      if (previous < time && time <= current) return true;
    }
    return false;
  }

  var SPRING_REST = 1e-9;

  function Spring(value, stiffness, damping) {
    this.value = value;
    this.velocity = 0;
    this.stiffness = stiffness === undefined ? 170 : stiffness;
    this.damping = damping === undefined ? 18 : damping;
  }

  Spring.prototype.step = function (target, delta) {
    // A spring at rest on its target is a fixed point of the integrator. Most
    // expression, entry and action weights sit there; skip their sub-steps and
    // snap sub-nanometre residue so decaying tails do not integrate forever.
    if (Math.abs(this.value - target) < SPRING_REST && Math.abs(this.velocity) < SPRING_REST) {
      this.value = target;
      this.velocity = 0;
      return target;
    }
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
      if (time < 0.085) return ease(time / 0.085);
      if (time < 0.12) return 1;
      return 1 - ease((time - 0.12) / 0.2);
    }
    return Math.max(
      pulse(elapsed),
      doubleBlink ? pulse(elapsed - 0.39) : 0
    );
  }

  // Waking from hidden, in seconds of a dedicated wake clock: a glimpse, not a
  // slow rousing. The lids flutter once and press back (the anticipation), then
  // fly open in about a quarter of a second and carry on past the mood's shape
  // into a wide-eyed inhale. The gaze is still lowered and turned aside when
  // the lids part; it lifts to the viewer a beat later, head trailing, face
  // leaning in, and overshoots a little before it lands. The wide look is
  // held, then one blink softens it into the mood. Every channel is a quintic
  // rise or a product of them, starting and ending at rest, so velocity and
  // acceleration stay continuous: the speed comes from short durations, never
  // from a kick.
  // The wake clock only starts after the scene has drawn smooth frames and
  // never advances more than maxStep per frame, so a stalled frame freezes the
  // motion instead of skipping ahead.
  var WAKE = {
    // [start, duration, from, to]; every row begins where the last one ended.
    lids: [[0.10, 0.20, 1, 0.80], [0.30, 0.18, 0.80, 0.93], [0.48, 0.28, 0.93, 0]],
    // [start, duration] of the lowered gaze and head lifting to the viewer.
    lift: [0.56, 0.46],
    // [start, attack, hold, release] of the wide look, the overshoot of the
    // lifting gaze, and the lean toward the viewer.
    wide: [0.60, 0.30, 0.30, 0.55], glance: [0.76, 0.30, 0.10, 0.55],
    lean: [0.64, 0.40, 0.20, 0.60], accents: [0.76, 0.60],
    arrive: 0.52, refocus: 1.5, end: 1.9,
    // inhale: share of idle's widened inhale pose mixed in at the widest point.
    inhale: 0.3, asymmetry: 0.06, breath: 0.014,
    droopGaze: 13, droopSide: -9, droopNod: 0.05, droopTilt: 0.018,
    glanceX: 3.5, glanceY: -2.5,
    warmFrames: 8, smoothFrame: 0.05, maxStep: 0.04, maxWait: 1.5,
  };
  var WAKE_SHAPE_KEYS = ['x', 'y', 'w', 'h', 'a', 'u', 'd', 'uc', 'lc', 'u1', 'u3', 'd1', 'd3'];

  function smootherstep(value) {
    var t = Math.max(0, Math.min(1, value));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function getWakeEnvelope(age) {
    var closed = 1, peek = 0, opening = WAKE.lids.length - 1;
    for (var i = 0; i <= opening; i++) {
      var lid = WAKE.lids[i];
      if (age < lid[0]) break;
      closed = lid[2] + (lid[3] - lid[2]) * smootherstep((age - lid[0]) / lid[1]);
      if (i < opening) peek = 1 - closed;
    }
    return {
      closed: closed,
      // The sleeping posture stirs with the flutter, then lifts after the lids.
      droop: (1 - peek * 0.5) * (1 - smootherstep((age - WAKE.lift[0]) / WAKE.lift[1])),
      wide: beat(age, WAKE.wide[0], WAKE.wide[1], WAKE.wide[2], WAKE.wide[3]),
      glance: beat(age, WAKE.glance[0], WAKE.glance[1], WAKE.glance[2], WAKE.glance[3]),
      lean: beat(age, WAKE.lean[0], WAKE.lean[1], WAKE.lean[2], WAKE.lean[3]),
      // Brows and symbols arrive once the eyes are open.
      accents: smootherstep((age - WAKE.accents[0]) / WAKE.accents[1]),
      light: ease(1 - closed),
    };
  }

  function EyeSimulation(options) {
    options = options || {};
    this.emotion = 'idle';
    this.energy = 0.65;
    this.autonomous = true;
    this.accents = options.accents !== false;
    this.follow = true;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.paused = false;
    this.target = getPose('idle');
    this.springs = {};
    this.expressionWeights = {};
    this.entryWeights = {};
    this.actionWeights = {};
    this.performanceStarts = {};
    for (var emotion of EXPRESSIONS) {
      this.expressionWeights[emotion.id] = new Spring(emotion.id === 'idle' ? 1 : 0, 150, 25);
      this.entryWeights[emotion.id] = new Spring(0, 220, 29);
      this.actionWeights[emotion.id] = emotion.id === 'idle'
        ? [new Spring(0,74,21),new Spring(0,74,21),new Spring(0,74,21)]
        : [new Spring(0,150,25),new Spring(0,150,25),new Spring(0,150,25)];
      this.performanceStarts[emotion.id] = 0;
    }
    this.performanceMotion = new Spring(0, 100, 22);
    for (var key in this.target) {
      if (Object.prototype.hasOwnProperty.call(this.target, key)) {
        this.springs[key] = new Spring(this.target[key]);
      }
    }
    this.gaze = { x: 0, y: 0, until: 0 };
    this.pointer = { x: 0, y: 0, active: false, until: 0 };
    // Seconds a resting cursor holds the gaze; Infinity never lets go.
    this.attentionHold = ATTENTION.hold;
    this.interest = new Spring(1, 60, 15.5);
    this.noticeAt = -10;
    this.nextBlink = 2.5;
    this.wakeState = 'idle';
    this.wakeClock = 0;
    this.wakeWarm = 0;
    this.wakeWaitAt = 0;
    this.wakeRefocused = true;
    // Set by the host while it is still loading the scene or settling the
    // glass; the sequence waits for it so no start-up stall lands mid-motion.
    this.wakeHold = false;
    this.blinkStart = -10;
    this.doubleBlink = false;
    this.blinkDuration = 1;
    this.random = options.random || Math.random;
    this.elapsed = 0;
    this.lightTime = 0;
    this.flowTime = 0;
    this.lightGaze = {
      x: new Spring(0, 180, 28),
      y: new Spring(0, 180, 28),
    };
    // Lean is a slow, critically damped approach toward or away from the
    // viewer; it carries a mood's posture, never a bounce.
    this.face = {yaw: new Spring(0, 95, 21), pitch: new Spring(0, 85, 20),
      lean: new Spring(0, 60, 15.5)};
    this.actingClock = 0;
    this.attentionTarget = { x: 0, y: 0 };
    this.attentionAt = -10;
    this.emotionAt = 0;
    this.emotionNaturalAt = 0;
    this.fixationAt = 0;
    this.fixationTarget = { x: 0, y: 0 };
    // Squash/stretch is a damped oscillator kicked by impulses, so a new pop
    // during an earlier one adds to it instead of snapping the face scale.
    var popFrequency = Math.PI * 2 / POP_PERIOD;
    this.pop = new Spring(0, popFrequency * popFrequency + POP_DECAY * POP_DECAY,
      POP_DECAY * 2);
    this.saccadeAnchor = { x: 0, y: 0 };
    this.saccadeArmed = true;
    this.pointerRest = { x: 0, y: 0, at: 0 };
    this.wasPointing = false;
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
    var target = getPose(id);
    if (this.emotion === id) return;
    this.target = target;
    this.emotion = id;
    this.emotionAt = this.elapsed;
    this.emotionNaturalAt = this.flowTime;
    this.performanceStarts[id] = this.flowTime;
    this.actingClock = 0;
    this.fixationAt = this.flowTime;
    this.attentionAt = this.elapsed;
    if (!this.reducedMotion) kickPop(this, getPopGain(id));
  };

  function kickPop(simulation, gain) {
    simulation.pop.velocity += gain * POP_SCALE * Math.PI * 2 / POP_PERIOD;
  }

  EyeSimulation.prototype.setActivity = function (id) {
    getActivity(id);
    this.setEmotion(id);
  };

  EyeSimulation.prototype.blink = function (doubleBlink) {
    this.blinkStart = this.elapsed;
    this.doubleBlink = Boolean(doubleBlink);
    var style = MOOD_ACTING[getMood(this.emotion)].blink;
    this.blinkDuration = style[2];
    this.nextBlink = this.flowTime + style[0] + this.random() * 2.6;
  };

  // Plays the opening sequence from closed lids. Called when the face goes from
  // hidden to shown; reduced motion keeps the plain fade instead. The face
  // starts in the sleeping posture, lowered and turned aside (set while it is
  // still hidden), and waits, eyes shut, for smooth frames before the wake
  // clock starts.
  EyeSimulation.prototype.wake = function () {
    if (this.reducedMotion) return;
    this.wakeState = 'warming';
    this.wakeClock = 0;
    this.wakeWarm = 0;
    this.wakeWaitAt = this.elapsed;
    this.wakeRefocused = false;
    this.blinkStart = -10;
    this.nextBlink = this.flowTime + WAKE.end + 2.5;
    // The first look goes to the cursor, however long it rested while hidden.
    this.pointerRest.at = this.elapsed;
    this.interest.value = 1;
    this.interest.velocity = 0;
    this.noticeAt = -10;
    var sleeping = [[this.springs.gazeY, WAKE.droopGaze], [this.springs.gazeX, WAKE.droopSide],
      [this.springs.tilt, WAKE.droopTilt], [this.lightGaze.y, WAKE.droopGaze],
      [this.lightGaze.x, WAKE.droopSide],
      // The head follows the lowered gaze (getFaceTarget) as well as nodding.
      [this.face.pitch, WAKE.droopGaze / 28 * 0.24 + WAKE.droopNod],
      [this.face.yaw, WAKE.droopSide / 40 * 0.34]];
    for (var item of sleeping) {
      item[0].value += item[1];
      item[0].velocity = 0;
    }
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
    if (alive) this.flowTime += dt;
    var naturalTime = this.flowTime;
    // Wake: wait for smooth frames, then run on a clock that cannot jump.
    if (this.wakeState !== 'idle' && reduce) this.wakeState = 'idle';
    if (this.wakeState === 'warming') {
      if (dt > WAKE.smoothFrame) this.wakeWarm = 0;
      else if (dt > 0 && !this.wakeHold) this.wakeWarm++;
      if (this.wakeWarm >= WAKE.warmFrames || t - this.wakeWaitAt > WAKE.maxWait) {
        this.wakeState = 'playing';
      }
    } else if (this.wakeState === 'playing') {
      this.wakeClock += Math.min(dt, WAKE.maxStep);
      if (this.wakeClock >= WAKE.end) this.wakeState = 'idle';
    }
    var waking = this.wakeState !== 'idle';
    var wake = waking ? getWakeEnvelope(this.wakeClock)
      : {closed: 0, droop: 0, wide: 0, glance: 0, lean: 0, accents: 1, light: 1};
    if (waking && this.wakeClock < WAKE.arrive) {
      // Until the eyes are open, the mood's performance holds at its first beat
      // instead of playing, popping or blinking behind closed lids.
      this.emotionAt = t;
      this.emotionNaturalAt = naturalTime;
      this.fixationAt = naturalTime;
      this.attentionAt = t;
      this.actingClock = 0;
      this.pop.value = 0;
      this.pop.velocity = 0;
    }
    var emotionAge = t - this.emotionAt;
    if (waking && !this.wakeRefocused && this.wakeClock >= WAKE.refocus) {
      this.wakeRefocused = true;
      this.blink(false);
    }
    var currentCues = alive
      ? getActingCues(this.emotion, naturalTime - this.emotionNaturalAt)
      : null;
    var ambient = alive
      ? getAmbientGaze(this.emotion, naturalTime - this.emotionNaturalAt)
      : { x: 0, y: 0 };
    var canBlink = alive && !waking && !(this.emotion === 'surprised' && t - this.emotionAt < 0.9);

    // Beat-synchronised hops and blinks. Performance time only advances with
    // natural motion, so pausing never fires a missed cue on resume. Acted
    // blinks run before the automatic one, which they reschedule, and may
    // close the surprise hold: that is where its double take belongs.
    var performanceTime = naturalTime - this.emotionNaturalAt;
    if (alive && performanceTime > this.actingClock) {
      var events = getActingEvents(this.emotion);
      var cycle = getPerformanceDuration(this.emotion);
      for (var cue of events) {
        if (!cueCrossed(this.actingClock, performanceTime, cue.at, cycle, cue.once)) continue;
        if (cue.pop) kickPop(this, cue.pop);
        if (cue.blink && !waking && t - this.blinkStart > 0.8 &&
            (cue.blink >= 1 || this.random() < cue.blink)) this.blink(cue.double);
      }
    }
    this.actingClock = performanceTime;
    var mood = getMood(this.emotion);
    if (canBlink && naturalTime > this.nextBlink) {
      this.blink(this.random() < MOOD_ACTING[mood].blink[1]);
    }
    var directed = t < this.gaze.until;
    var pointing = this.follow && (this.pointer.active || t < (this.pointer.until || 0));
    // A cursor that moves again after resting is noticed with a small perk,
    // and with a widened look if the eyes had already gone back to work.
    if (pointing) {
      var resting = this.pointerRest;
      if (!this.wasPointing ||
          Math.hypot(this.pointer.x - resting.x, this.pointer.y - resting.y) > 2.5) {
        if (alive && (!this.wasPointing || t - resting.at > 3)) kickPop(this, -0.55);
        if (alive && this.wasPointing && this.interest.value < 0.5) this.noticeAt = t;
        this.pointerRest = { x: this.pointer.x, y: this.pointer.y, at: t };
      }
    }
    this.wasPointing = pointing;
    // Interest in a resting cursor fades; without natural motion there is no
    // acting to return to, so the gaze simply stays.
    var interest = 0;
    if (pointing) {
      // Looking away is unhurried; looking back is a dart.
      var bored = alive && t - this.pointerRest.at >= this.attentionHold;
      this.interest.stiffness = bored ? 60 : 420;
      this.interest.damping = bored ? 15.5 : 41;
      interest = Math.max(0, Math.min(1, this.interest.step(bored ? 0 : 1, dt)));
    } else {
      this.interest.value = 1;
      this.interest.velocity = 0;
    }
    var target;
    if (directed) {
      target = getAttentionPose(this.target, this.gaze.x, this.gaze.y);
    } else {
      target = clone(this.target);
      target.gazeX += ambient.x * energy;
      target.gazeY += ambient.y * energy;
      if (alive) target.tilt += getAmbientLean(this.emotion,
        naturalTime - this.emotionNaturalAt, energy);
      if (interest > 0) {
        var attended = getAttentionPose(this.target, this.pointer.x, this.pointer.y);
        if (interest >= 1) target = attended;
        else for (var blended in attended) {
          target[blended] += (attended[blended] - target[blended]) * interest;
        }
      }
    }
    // Wide looks are an inhale; a smile or a drowsy mood keeps its own shape.
    var inhale = Math.max(wake.wide * WAKE.inhale, alive
      ? ATTENTION.widen * beat(t - this.noticeAt, ATTENTION.notice[0],
        ATTENTION.notice[1], ATTENTION.notice[2], ATTENTION.notice[3]) : 0) *
      Math.max(0, Math.min(1, 1 - this.springs.happy.value - this.springs.sleepy.value));
    // Large shifts of attention are often covered by a blink. A slow follower
    // of the intended gaze measures how far it has just jumped: smooth pursuit
    // never builds enough lead, and each jump makes at most one decision.
    var anchor = this.saccadeAnchor;
    var jump = Math.hypot(target.gazeX - anchor.x, target.gazeY - anchor.y);
    var follow = 1 - Math.exp(-dt / 0.3);
    anchor.x += (target.gazeX - anchor.x) * follow;
    anchor.y += (target.gazeY - anchor.y) * follow;
    if (jump < 5) this.saccadeArmed = true;
    else if (jump > 15 && this.saccadeArmed) {
      this.saccadeArmed = false;
      if (canBlink && t - this.blinkStart > 1.6 &&
          this.random() < (mood === 'focused' ? 0.35 : 0.55)) {
        this.blink(this.random() < 0.1);
      }
    }
    var gazeChange = Math.hypot(target.gazeX - this.fixationTarget.x,
      target.gazeY - this.fixationTarget.y);
    if (gazeChange > 1.2) {
      this.fixationAt = naturalTime;
      this.fixationTarget = { x: target.gazeX, y: target.gazeY };
    }
    // Keep the main reflection anchored to the intended target, not micro acting.
    if (waking) {
      // A real target (the cursor, a directed look) is where the lift lands;
      // without one the gaze carries a little past the viewer and settles.
      var carry = directed || pointing ? 0 : wake.glance;
      target.gazeY += WAKE.droopGaze * wake.droop + WAKE.glanceY * carry;
      target.gazeX += WAKE.droopSide * wake.droop + WAKE.glanceX * carry;
      target.tilt += WAKE.droopTilt * wake.droop;
    }
    var lightTargetX = target.gazeX;
    var lightTargetY = target.gazeY;
    if (alive) {
      var fixation = getFixationMotion(this.emotion, naturalTime - this.fixationAt);
      target.gazeX += fixation.x * energy;
      target.gazeY += fixation.y * energy;
      var accent = getExpressionAccent(this.emotion, emotionAge);
      var rest = getRestingMotion(
        this.emotion, naturalTime - this.emotionNaturalAt, currentCues);
      var motion = motionPose();
      for (var channel in motion) motion[channel] = accent[channel] + rest[channel];
      motion.open -= fixation.lid;
      applyMotion(target, motion, energy);
    }
    if (waking) {
      // One eye leads a little through the opening.
      var openness = 1 - wake.closed;
      var stare = motionPose();
      stare.asymmetry = WAKE.asymmetry * 4 * openness * (1 - openness);
      applyMotion(target, stare, 1);
    }
    if (inhale > 0) {
      // The spline renderers take the inhale from the pose; Rive mixes the
      // same baked pose below.
      var wide = getInhalePose();
      for (var eyeSide of ['l', 'r']) for (var shape of WAKE_SHAPE_KEYS) {
        target[eyeSide + shape] += (wide[eyeSide + shape] - target[eyeSide + shape]) * inhale;
      }
    }

    target.tilt = Math.max(-0.029, Math.min(0.029, target.tilt));
    target.lr = Math.max(-0.024, Math.min(0.024, target.lr));
    target.rr = Math.max(-0.024, Math.min(0.024, target.rr));
    var values = {};
    for (var key in this.springs) {
      if (!Object.prototype.hasOwnProperty.call(this.springs, key)) continue;
      var spring = this.springs[key];
      var attentionPosition = key === 'gazeX' || key === 'gazeY';
      var lightParameter = key.indexOf('light') === 0;
      var orientation = key === 'tilt' || key === 'lr' || key === 'rr';
      spring.stiffness = attentionPosition ? 280 : orientation ? 105 : lightParameter ? 125 : 170;
      // Gaze is slightly underdamped (about 1.5% overshoot): eye darts land
      // and settle instead of easing in, without visible wobble.
      spring.damping = reduce ? 34 : attentionPosition ? 27
        : orientation || lightParameter ? 23 : 25.5 - energy * 0.7;
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
    values.lightGazeX = this.lightGaze.x.step(lightTargetX, dt);
    values.lightGazeY = this.lightGaze.y.step(lightTargetY, dt);
    values.attentionAccent = reduce ? 0 : attentionEnvelope(t - this.attentionAt);
    var faceTarget = getFaceTarget(values);
    // The head trails the eyes, then settles with a barely visible follow-
    // through (under 1% on a full turn). Lower damping would exceed the
    // 0.04 rad per 60 Hz frame turn rate the face regression allows.
    this.face.yaw.damping = reduce ? 30 : 16;
    this.face.pitch.damping = reduce ? 30 : 15;
    var body = alive ? getBodyActing(this.emotion, performanceTime,
      emotionAge, currentCues) : {lean: 0, nod: 0};
    var faceYaw = this.face.yaw.step(faceTarget.yaw, dt);
    var facePitch = this.face.pitch.step(Math.max(-0.28, Math.min(0.28,
      faceTarget.pitch + body.nod * energy + WAKE.droopNod * wake.droop)), dt);
    var faceLean = this.face.lean.step(Math.max(-LEAN_LIMIT, Math.min(LEAN_LIMIT,
      body.lean * energy + WAKE.breath * wake.lean)), dt);
    if (!reduce) this.lightTime += dt;
    var pop = this.pop.step(0, dt);
    var bounce = reduce ? 0 : Math.max(-0.03, Math.min(0.03, pop * (0.3 + energy)));

    var motionWeight = Math.max(0, Math.min(1,
      this.performanceMotion.step(alive ? energy : 0, dt)));
    var rawWeights = [], weightSum = 0;
    for (var item of EXPRESSIONS) {
      var expressionSpring = this.expressionWeights[item.id];
      expressionSpring.stiffness = this.emotion === 'surprised' ? 220 : this.emotion === 'sleepy' ? 95 : 150;
      expressionSpring.damping = this.emotion === 'surprised' ? 29 : this.emotion === 'sleepy' ? 21 : 25;
      var weight = Math.max(0, expressionSpring.step(
        item.id === this.emotion ? 1 : 0, dt));
      if (weight < 0.0000001) weight = 0;
      rawWeights.push(weight);
      weightSum += weight;
    }
    var riveInputs = {}, accumulated = 0;
    for (var e = 0; e < EXPRESSIONS.length; ++e) {
      var emotionId = EXPRESSIONS[e].id;
      var entering = Math.max(0, Math.min(1, this.entryWeights[emotionId].step(
        alive && emotionId === this.emotion ? entryEnvelope(emotionId, emotionAge) * energy : 0, dt)));
      if (entering < 0.0000001) entering = 0;
      var gestures=[], gestureSum=0;
      for (var gesture=0; gesture<3; gesture++) {
        var amount=Math.max(0,Math.min(1,this.actionWeights[emotionId][gesture].step(
          alive && emotionId===this.emotion ? currentCues[gesture] : 0,dt))) * motionWeight / 2;
        if (amount < 0.0000001) amount = 0;
        gestures.push(amount); gestureSum+=amount;
      }
      if (gestureSum>1) {
        for (var g=0;g<3;g++) gestures[g]/=gestureSum;
        gestureSum=1;
      }
      var variants=[(1-gestureSum)*(1-entering),gestures[0]*(1-entering),entering,
        gestures[1]*(1-entering),gestures[2]*(1-entering)];
      for (var variant = 0; variant < 5; ++variant) {
        var contribution = rawWeights[e] / Math.max(0.000001, weightSum) * variants[variant] *
          (1 - inhale);
        // Idle's first gesture is baked at double strength: a clean, widened
        // inhale with no symbols of its own.
        if (inhale > 0 && emotionId === 'idle' && variant === 1) contribution += inhale;
        accumulated += contribution;
        // Direct blends apply in order. Convert barycentric weights to Rive's
        // successive interpolation factors, so even interrupted morphs blend
        // correctly and do not retain geometry from the preceding frame.
        riveInputs[RIVE_VARIANT_KEYS[e][variant]] =
          accumulated > 0 ? 100 * contribution / accumulated : 0;
      }
    }
    riveInputs.flow = motionWeight * 100 * wake.light;
    riveInputs.accents = this.accents ? 100 * wake.accents : 0;
    riveInputs.flowphase = (naturalTime % 14) / 14 * 100;
    var blinking = Math.max(wake.closed,
      blinkAmount((t - this.blinkStart) / this.blinkDuration, this.doubleBlink));
    riveInputs.blink = 100 * blinking;
    riveInputs.lookx = Math.max(-1, Math.min(1, (values.gazeX - this.target.gazeX) / 40));
    riveInputs.looky = Math.max(-1, Math.min(1, (values.gazeY - this.target.gazeY) / 28));
    riveInputs.lightx = Math.max(-1, Math.min(1, (values.lightGazeX - this.target.gazeX) / 40));
    riveInputs.lighty = Math.max(-1, Math.min(1, (values.lightGazeY - this.target.gazeY) / 28));
    riveInputs.propbase = 100;
    riveInputs.propleft = Math.max(0, Math.min(1, -values.gazeX / 40)) * 100;
    riveInputs.propright = Math.max(0, Math.min(1, values.gazeX / 40)) * 100;
    riveInputs.propup = Math.max(0, Math.min(1, -values.gazeY / 28)) * 100;
    riveInputs.propdown = Math.max(0, Math.min(1, values.gazeY / 28)) * 100;
    this.lastFrame = {
      pose: values,
      face: {yaw: faceYaw, pitch: facePitch, lean: faceLean,
        matrix: getFaceMatrix(faceYaw, facePitch, values.tilt, 1 + faceLean)},
      riveInputs: riveInputs,
      blink: blinking,
      accents: wake.accents,
      breathe: alive ? (Math.sin(naturalTime * 1.15) * 0.0035 +
        Math.sin(naturalTime * 1.93) * 0.0008) * energy : 0,
      bounce: bounce,
    };
    return this.lastFrame;
  };

  function lightDensity(x, y, kind) {
    var distance = kind === 1 ? Math.max(Math.abs(x), Math.abs(y)) : Math.hypot(x, y);
    return 1 - ease((distance - (kind === 1 ? 0.68 : 0.16)) /
      (kind === 1 ? 0.32 : 0.84));
  }

  function surfaceLight(ctx, eye, light, alpha) {
    if (alpha < 0.00001) return;
    // Slice the analytic field along the rig. Each slice follows the actual
    // upper and lower spline, including happy bands and asymmetric shoulders.
    var slices = light.kind === 1 ? 14 : 40;
    var left = light.x - light.spread, step = light.spread * 2 / slices;
    for (var i = 0; i < slices; ++i) {
      var u = left + (i + 0.5) * step;
      var projection = getLightGeometry({x: u, y: light.y,
        spread: step * 0.5, height: light.height}, eye);
      var qx = (u - light.x) / light.spread;
      var gradientHeight = projection.height * 0.5;
      ctx.save();
      ctx.translate(projection.x, projection.y);
      ctx.transform(1, projection.slope, 0, 1, 0, 0);
      var gradient = ctx.createLinearGradient(0, -gradientHeight, 0, gradientHeight);
      for (var j = 0; j <= 16; ++j) {
        var fraction = j / 16;
        var density = lightDensity(qx, fraction * 2 - 1, light.kind);
        gradient.addColorStop(fraction, 'rgba(202,166,235,' + (alpha * density) + ')');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(-projection.width * 0.5, -gradientHeight,
        projection.width + 0.015, projection.height);
      ctx.restore();
    }
  }

  function drawLight(ctx, simulation, pose, geometry, side, time, blink) {
    var light = getLight(pose, time, side);
    surfaceLight(ctx, geometry, light, light.strength * (1 - blink * 0.85));
    var fragments = getLightFragments(pose, simulation.flowTime || 0, side);
    for (var i = 0; i < fragments.length; ++i) {
      surfaceLight(ctx, geometry, fragments[i], fragments[i].strength * (1 - blink * 0.85));
    }
  }

  // Font-free filled vector paths are shared by Canvas and the Rive authoring
  // tool. Accessories inherit the face transform, but never the blink squash.
  // Rectangular brow bar: a thick inner head and squared outer tail, with one
  // restrained angular cut echoing the reference's crisp geometric language.
  var BROW_LEFT = [['M',50,-7],['L',45,-9],['L',-45,-3],
    ['L',-50,-1.2],['L',-50,1.8],['L',-45,2.4],
    ['L',45,8.4],['L',50,9],['Z']];
  var BROW_RIGHT = BROW_LEFT.map(function(command) {
    return command.map(function(value,index) { return index%2===1 ? -value : value; });
  });
  var STAR_PATH = [['M',0,-12],['C',1.8,-3.2,3.2,-1.8,12,0],
    ['C',3.2,1.8,1.8,3.2,0,12],['C',-1.8,3.2,-3.2,1.8,-12,0],
    ['C',-3.2,-1.8,-1.8,-3.2,0,-12],['Z']];
  var QUESTION_HOOK = [['M',-10,-11],['C',-10,-26,13,-27,13,-12],
    ['C',13,-5,5,-3,3,2],['L',3,6],['L',-1,6],['L',-1,1],
    ['C',-1,-5,8,-6,8,-12],['C',8,-21,-6,-21,-6,-11],['Z']];
  var QUESTION_DOT = [['M',1,10.2],['C',4.7,10.2,4.7,15.8,1,15.8],
    ['C',-2.7,15.8,-2.7,10.2,1,10.2],['Z']];
  var Z_PATH = [['M',-6,-9],['L',6,-9],['L',6,-6],['L',-2,6],
    ['L',6,6],['L',6,9],['L',-6,9],['L',-6,6],['L',2,-6],['L',-6,-6],['Z']];
  var ACCENT_DESIGNS = [
    {id:'brow-l', color:'#bca3d8', paths:[BROW_LEFT]},
    {id:'brow-r', color:'#bca3d8', paths:[BROW_RIGHT]},
    {id:'question', paths:[QUESTION_HOOK,QUESTION_DOT]},
    {id:'star-main', paths:[STAR_PATH]},
    {id:'star-small', paths:[STAR_PATH]},
    {id:'alert-l', paths:[[['M',-2,-13],['L',1,-16],['L',12,-5],['L',9,-2],['Z']],
      [['M',-9,6],['L',-8,2],['L',6,6],['L',5,10],['Z']]]},
    {id:'alert-r', paths:[[['M',2,-13],['L',-1,-16],['L',-12,-5],['L',-9,-2],['Z']],
      [['M',9,6],['L',8,2],['L',-6,6],['L',-5,10],['Z']]]},
    {id:'sleep-z', paths:[Z_PATH]},
    {id:'sleep-z-small', paths:[Z_PATH]},
  ];

  function polygon(points) {
    return points.map(function(p,i) { return [i ? 'L' : 'M',p[0],p[1]]; }).concat([['Z']]);
  }
  function bar(x,y,w,h) { return polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]); }
  var PAGE = [polygon([[-15,-20],[6,-20],[15,-11],[15,20],[-15,20],[-15,-20],
    [-12,-17],[-12,17],[12,17],[12,-10],[5,-17],[-12,-17]]),
    polygon([[5,-20],[8,-17],[8,-12],[13,-12],[15,-9],[5,-9]])];
  var LINES = [bar(-8,-6,16,2.5),bar(-8,1,16,2.5),bar(-8,8,10,2.5)];
  var CHECK = polygon([[-9,0],[-6,-3],[-1,2],[8,-8],[11,-5],[-1,8]]);
  var MAGNIFIER = [polygon([[-12,-16],[2,-16],[8,-10],[8,3],[2,9],[-12,9],[-18,3],[-18,-10],[-12,-16],
    [-11,-12],[-14,-8],[-14,1],[-10,5],[0,5],[4,1],[4,-8],[0,-12],[-11,-12]]),
    polygon([[5,5],[9,4],[20,17],[16,21]])];
  var PAGE_BODY = [polygon([[-15,-20],[6,-20],[15,-11],[15,20],[-15,20]])];
  var PROP_DESIGNS = [
    {id:'steps', paths:[bar(-16,9,9,4),bar(-4,1,9,4),bar(8,-7,9,4)]},
    {id:'page', paths:PAGE.concat(LINES), body:PAGE_BODY},
    {id:'search', paths:MAGNIFIER},
    {id:'new-page', paths:PAGE.concat([bar(-8,-1,16,3),bar(-1.5,-7.5,3,16)]),body:PAGE_BODY},
    {id:'writing-page', paths:PAGE,body:PAGE_BODY},
    {id:'ink-a', paths:[bar(-8,-1,15,2.3)]},
    {id:'ink-b', paths:[bar(-8,6,11,2.3)]},
    {id:'pencil', paths:[polygon([[-2,11],[0,3],[17,-16],[22,-11],[5,8]]),
      polygon([[18,-18],[21,-21],[26,-16],[23,-13]])]},
    {id:'terminal', paths:[bar(-23,-17,46,3),bar(-23,-14,3,31),bar(20,-14,3,31),bar(-23,14,46,3),
      bar(-23,-9,46,2),bar(-17,-13,2,2),bar(-12,-13,2,2),
      polygon([[-14,-4],[-5,2],[-14,9],[-16,6],[-10,2],[-16,-1]])],
      body:[bar(-22,-16,44,32)]},
    {id:'terminal-a',paths:[bar(-1,-3,15,2)]},
    {id:'terminal-b',paths:[bar(-1,4,10,2)]},
    {id:'link', paths:[polygon([[-22,-2],[0,-2],[0,4],[22,4],[22,7],[-3,7],[-3,1],[-22,1]])]},
    {id:'plug-l',paths:[bar(-6,-8,12,16),bar(6,-4,5,3),bar(6,2,5,3)],body:[bar(-6,-8,12,16)]},
    {id:'plug-r',paths:[bar(-6,-8,12,16),bar(-11,-4,5,3),bar(-11,2,5,3)],body:[bar(-6,-8,12,16)]},
    {id:'wrench', paths:[polygon([[4,-19],[13,-20],[10,-12],[14,-8],[22,-10],[21,-1],[13,4],
      [7,2],[-9,20],[-17,12],[1,-4],[-1,-10]])]},
    {id:'handbook', paths:[polygon([[-22,-15],[-4,-12],[0,-8],[4,-12],[22,-15],[22,16],[4,19],[0,16],
      [-4,19],[-22,16],[-22,-15],[-19,-11],[-19,13],[-4,16],[-2,14],[-2,-7],[-5,-9],[-19,-11]]),
      polygon([[2,-7],[5,-9],[19,-11],[19,13],[4,16],[2,14]]),bar(-15,-3,8,2),bar(-15,3,8,2)],
      body:[polygon([[-22,-15],[0,-8],[22,-15],[22,16],[0,20],[-22,16]])]},
    {id:'turn-page',paths:[polygon([[0,-8],[17,-12],[17,13],[0,17]])],body:[polygon([[0,-8],[17,-12],[17,13],[0,17]])]},
    {id:'check', paths:[bar(-17,-17,34,3),bar(-17,-14,3,31),bar(14,-14,3,31),bar(-17,14,34,3)],body:[bar(-16,-16,32,32)]},
    {id:'tick', paths:[CHECK]},
    {id:'inspect', paths:MAGNIFIER.concat([bar(-6,-8,3,9),bar(-6,3,3,3)])},
    {id:'review', paths:PAGE.concat([CHECK]),body:PAGE_BODY},
    {id:'save', paths:[polygon([[-21,4],[-17,4],[-17,15],[17,15],[17,4],[21,4],[21,19],[-21,19]])]},
    {id:'save-arrow',paths:[polygon([[-2,-18],[2,-18],[2,0],[9,-6],[12,-3],[0,9],[-12,-3],[-9,-6],[-2,0]])]},
    {id:'branch', paths:[bar(-4,-19,8,8),bar(-21,11,8,8),bar(13,11,8,8),bar(-1.5,-11,3,9),
      bar(-18.5,-2,37,3),bar(-18.5,1,3,10),bar(15.5,1,3,10)]},
    {id:'pause', paths:[bar(-11,-13,7,26),bar(4,-13,7,26)]},
    {id:'blocked', paths:[polygon([[0,-21],[22,17],[-22,17],[0,-21],
      [0,-14],[-16,14],[16,14],[0,-14]]),bar(-1.5,-5,3,10),bar(-1.5,8,3,3)]},
    {id:'retry', paths:[polygon([[16,-3],[12,-12],[-8,-12],[-13,-6],[-13,7],[-6,13],[10,13],[10,17],
      [-8,17],[-17,9],[-17,-8],[-10,-16],[14,-16],[20,-5],[24,-9],[24,3],[12,3]])]},
    {id:'summary', paths:PAGE.concat([bar(-8,-7,16,3),bar(-8,0,12,3),bar(-8,7,8,3)]),body:PAGE_BODY},
  ];
  ACCENT_DESIGNS = ACCENT_DESIGNS.concat(PROP_DESIGNS.map(function(design) {
    return {id:'prop-'+design.id,color:'#cfb5e8',paths:design.paths,body:design.body,
      prop:true,depth:design.id.indexOf('ink-')===0 || /terminal-[ab]|tick/.test(design.id) ? 0 : 3.2};
  }));
  var ACTIVITY_PROPS = {planning:'steps',reading:'page',searching:'search',creating:'new-page',
    editing:'pencil',running:'terminal',mcp:'link',tool:'wrench',skill:'handbook',testing:'check',
    debugging:'inspect',reviewing:'review',saving:'save',delegating:'branch',waiting:'pause',
    blocked:'blocked',retrying:'retry',summarizing:'summary'};
  var PROP_LAYOUTS = {
    page:[0,104,1.35,-.06],search:[118,36,1.35,-.18],
    'new-page':[82,99,1.3,.08],pencil:[105,87,1.15,-.12],
    terminal:[0,104,1.5,-.025],link:[0,103,1.3,0],wrench:[78,92,1.3,-.12],
    handbook:[0,103,1.4,-.03],check:[0,103,1.3,.04],inspect:[116,38,1.4,-.15],
    review:[0,105,1.35,-.04],save:[0,105,1.4,0],branch:[0,102,1.35,0],
    pause:[0,105,1.1,0],blocked:[0,102,1.15,-.04],retry:[0,103,1.3,-.04],
    summary:[0,104,1.35,-.04],steps:[0,105,1.3,0]
  };

  function getPropViewX(value) {
    value=Math.max(-1,Math.min(1,value));
    return {x:-value*2,y:0,rotation:value*.14,scaleX:1-Math.abs(value)*.12,scaleY:1};
  }
  function getPropViewY(value) {
    value=Math.max(-1,Math.min(1,value));
    return {x:0,y:value*3,rotation:-value*.05,scaleX:1,scaleY:1-Math.abs(value)*.12};
  }

  function getAccentStates(pose) {
    var states = {};
    function put(id,x,y,alpha,sx,sy,rotation) {
      states[id] = {x:x,y:y,opacity:Math.max(0,Math.min(.85,alpha)),
        scaleX:sx === undefined ? 1 : sx,scaleY:sy === undefined ? 1 : sy,
        rotation:rotation || 0};
    }
    var happy=pose.happy, curious=pose.curious, confused=pose.confused;
    var focused=pose.focused, surprised=pose.surprised;
    for (var side of ['l','r']) {
      var eye=getEyeGeometry(pose,side,0,0);
      var span=1.08;
      var start=Rig.edges(eye,-.85).upper;
      var end=Rig.edges(eye,.85).upper;
      var rotation=Math.max(-.16,Math.min(.16,Math.atan2(end-start,eye.width*.85)));
      // Follow the lid direction and reserve a clear gap below the entire
      // brow, including the wider ends and asymmetric acting poses.
      var ceiling=Infinity;
      for (var i=0;i<=16;i++) {
        var x=(i/8-1)*eye.width*span/2;
        var u=Math.max(-1,Math.min(1,2*x*Math.cos(rotation)/eye.width));
        ceiling=Math.min(ceiling,Rig.edges(eye,u).upper-x*Math.sin(rotation));
      }
      put('brow-'+side,pose[side+'x'],
        pose[side+'y']+ceiling-22,focused*.78+confused*.72,
        eye.width*span/100,1,rotation);
    }
    put('question',214,-100+confused*27,curious*.66+confused*.8,
      .9+confused*.18,.9+confused*.18,-confused*.08);
    // The stars respond to the same lifted smile as the lids, with no extra
    // clock or perpetual twinkling. Paused/reduced motion keeps the held cue.
    var joyLift=Math.max(-8,Math.min(8,((pose.ly+pose.ry)/2+6)*.55));
    put('star-main',211,-65+joyLift,happy*.78,1,1);
    put('star-small',-210,-34+joyLift*.6,happy*.58,.62,.62);
    put('alert-l',-217,-94,surprised*.7);
    put('alert-r',217,-94,surprised*.7);
    put('sleep-z',207,-27,pose.sleepy*.65,1,1);
    put('sleep-z-small',229,-52,pose.sleepy*.44,.65,.65);
    var a=pose.propA, b=pose.propB, c=pose.propC;
    for (var design of PROP_DESIGNS) put('prop-'+design.id,0,104,0);
    function prop(name,weight,x,y,scale,rotation,alpha,sx) {
      put('prop-'+name,x,y,weight*(alpha===undefined?.8:alpha),
        scale*(sx===undefined?1:sx),scale,rotation);
    }
    for (var activity of ACTIVITIES) {
      var weight=pose['activity'+activity.id] || 0, name=ACTIVITY_PROPS[activity.id];
      if (!name) continue;
      var layout=PROP_LAYOUTS[name], x=layout[0],y=layout[1],scale=layout[2],angle=layout[3];
      // These are operations on an object: inspect, write, connect and put away.
      // Their cues are the eye gestures themselves, never a second timeline.
      if (name==='search'||name==='inspect') { x-=a*5; y-=a*12-b*3; angle+=a*.12-b*.09; }
      else if (name==='pencil') { x+=a*12-b*9; y+=a*3+b*7-c*9; angle+=a*.2-b*.15; }
      else if (name==='new-page') { y-=a*7+c*3; angle-=a*.1; }
      else if (name==='wrench') { angle+=a*.22-b*.18; y+=a*2-b*2; }
      else if (name==='handbook') { angle+=a*.05-b*.04; }
      else if (name==='save') { y+=a*3; }
      else { y+=(a+b)*1.5-c*2; angle+=a*.025-b*.025; }
      prop(name,weight,x,y,scale,angle);
      if (activity.id==='editing') {
        prop('writing-page',weight,96,105,1.35,.03);
        prop('ink-a',weight,96,105,1.35,.03,.18+a*.65);
        prop('ink-b',weight,96,105,1.35,.03,.16+b*.65);
      } else if (activity.id==='running') {
        prop('terminal-a',weight,x,y,scale,angle,.22+a*.6);
        prop('terminal-b',weight,x,y,scale,angle,.18+b*.65);
      } else if (activity.id==='mcp') {
        prop('plug-l',weight,-34+a*13,100,1.3,-.06+a*.06);
        prop('plug-r',weight,34-b*13,106,1.3,.06-b*.06);
        states['prop-link'].opacity*=.38+(a+b)*.42;
      } else if (activity.id==='skill') {
        prop('turn-page',weight,0,103,1.4,-.03+a*.08,.55,1-a*.7+b*.12);
      } else if (activity.id==='testing') {
        prop('tick',weight,x,y+2-c*2,scale,angle,.24+(a+b+c)*.35);
      } else if (activity.id==='saving') {
        prop('save-arrow',weight,0,94+a*11+b*3,1.3,0,.7-c*.3);
      }
    }
    return states;
  }

  function drawAccents(ctx, pose) {
    var states=getAccentStates(pose);
    function trace(paths) {
      ctx.beginPath();
      for (var path of paths) for (var command of path) {
        if(command[0]==='M')ctx.moveTo(command[1],command[2]);
        else if(command[0]==='L')ctx.lineTo(command[1],command[2]);
        else if(command[0]==='C')ctx.bezierCurveTo(command[1],command[2],command[3],command[4],command[5],command[6]);
        else ctx.closePath();
      }
      ctx.fill();
    }
    ctx.save();
    for (var design of ACCENT_DESIGNS) {
      var state=states[design.id];
      if (state.opacity<.0001) continue;
      ctx.save();
      ctx.fillStyle=design.color || '#b08add';
      ctx.globalAlpha*=state.opacity;
      if (design.prop) {
        for (var view of [getPropViewY(pose.gazeY/28),getPropViewX(pose.gazeX/40)]) {
          ctx.translate(view.x,view.y);ctx.rotate(view.rotation);ctx.scale(view.scaleX,view.scaleY);
        }
      }
      ctx.translate(state.x,state.y);
      ctx.rotate(state.rotation);
      ctx.scale(state.scaleX,state.scaleY);
      if (design.depth) {
        ctx.save();ctx.translate(design.depth,design.depth*1.25);
        ctx.fillStyle='#654781';trace(design.body || design.paths);ctx.restore();
      }
      if (design.body) {
        ctx.save();ctx.globalAlpha*=.6;
        var surface=ctx.createLinearGradient(-24,-24,24,24);
        surface.addColorStop(0,'#b18bd2');surface.addColorStop(1,'#825ca9');
        ctx.fillStyle=surface;trace(design.body);ctx.restore();
      }
      if (design.prop) {
        var bevel=ctx.createLinearGradient(0,-22,0,22);
        bevel.addColorStop(0,'#dfc8f1');bevel.addColorStop(1,design.color);
        ctx.fillStyle=bevel;
      }
      trace(design.paths);
      ctx.restore();
    }
    ctx.restore();
  }

  EyeSimulation.prototype.draw = function (ctx) {
    var frame = this.lastFrame;
    if (!frame) return;
    applyFaceProjection(ctx.canvas, this);
    var pose = frame.pose;
    var blink = frame.blink;
    var t = this.elapsed;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.translate(this.layout.centerX, this.layout.centerY);
    ctx.scale(this.scale, this.scale * this.layout.stretchY);

    ctx.save();
    ctx.translate(pose.gazeX, pose.gazeY * this.layout.gazeScaleY);
    ctx.scale(1 + frame.bounce, 1 - frame.bounce);
    var breathe = frame.breathe;
    var sides = ['l', 'r'];
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i];
      var geometry = getEyeGeometry(pose, side, blink, breathe);
      var width = geometry.width;
      var height = geometry.height;
      ctx.save();
      ctx.translate(pose[side + 'x'], pose[side + 'y'] + geometry.offsetY);
      ctx.rotate(pose[side + 'r']);
      eyePath(ctx, geometry);
      var surface = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
      surface.addColorStop(0, '#9c69de');
      surface.addColorStop(0.55, '#8e52d5');
      surface.addColorStop(1, '#7d45c4');
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.save();
      ctx.clip();
      drawLight(ctx, this, pose, geometry, side, this.lightTime, blink);
      ctx.restore();
      ctx.restore();
    }
    if (this.accents) {
      ctx.save();
      ctx.globalAlpha *= frame.accents;
      drawAccents(ctx, pose);
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
  };

  function createSimulation(options) {
    return new EyeSimulation(options);
  }

  var api = {
    EMOTIONS: EMOTIONS,
    ACTIVITIES: ACTIVITIES,
    EXPRESSIONS: EXPRESSIONS,
    getActivity: getActivity,
    Spring: Spring,
    EyeSimulation: EyeSimulation,
    createSimulation: createSimulation,
    getPose: getPose,
    getLayout: getLayout,
    getPointerGaze: getPointerGaze,
    getAttentionPose: getAttentionPose,
    getFaceTarget: getFaceTarget,
    getFaceMatrix: getFaceMatrix,
    getFaceScreenMatrix: getFaceScreenMatrix,
    applyFaceProjection: applyFaceProjection,
    getEyeGeometry: getEyeGeometry,
    getEyeEdges: Rig.edges,
    getSurfacePoint: Rig.surfacePoint,
    lightDensity: lightDensity,
    rig: {name: Rig.upstream, revision: Rig.revision},
    eyePath: eyePath,
    getLight: getLight,
    getLightGeometry: getLightGeometry,
    getLightFragments: getLightFragments,
    attentionEnvelope: attentionEnvelope,
    getAmbientGaze: getAmbientGaze,
    getAmbientLean: getAmbientLean,
    getGazeCues: getGazeCues,
    getBodyActing: getBodyActing,
    getActingEvents: getActingEvents,
    getFixationMotion: getFixationMotion,
    getExpressionAccent: getExpressionAccent,
    getPerformancePose: getPerformancePose,
    getEntryPose: getEntryPose,
    getGesturePose: getGesturePose,
    getActingCues: getActingCues,
    getPerformanceDuration: getPerformanceDuration,
    blinkAmount: blinkAmount,
    getWakeEnvelope: getWakeEnvelope,
    WAKE: WAKE,
    drawLight: drawLight,
    drawAccents: drawAccents,
    getAccentStates: getAccentStates,
    getPropViewX: getPropViewX,
    getPropViewY: getPropViewY,
    accentDesigns: ACCENT_DESIGNS,
  };
  if (typeof globalThis !== 'undefined') globalThis.EyesCore = api;
  return api;
})();
