/*
 * Sentient Eye Engine spline rig — JavaScript / Qt port.
 * Copyright (c) 2025 SentientLabs. MIT; see LICENSE in this directory.
 * Upstream: Sentient-LabsDev/Sentient-Eye-Engine @
 * 42761191371f328361b62b5cfd095aac3f58c33d, modules/face_renderer.py.
 *
 * Ports catmull_rom_spline and the five-node rig in draw_advanced_brow.
 * Eyes extensions: independent lower lid, analytic cubic coefficients,
 * exact Canvas Beziers, and surface coordinates for diffuse lighting.
 */
var SentientEyeRig = (function () {
  function catmullRom(p0, p1, p2, p3, t) {
    return 0.5 * ((2 * p1) + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }

  function compile(nodes) {
    if (nodes.length !== 5) throw new RangeError('A Sentient lid needs five control points');
    var curves = [];
    for (var i = 0; i < 4; ++i) {
      var p0 = nodes[Math.max(0, i - 1)], p1 = nodes[i];
      var p2 = nodes[i + 1], p3 = nodes[Math.min(4, i + 2)];
      curves.push([
        p1, (p2 - p0) * 0.5,
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * 0.5,
        (-p0 + 3 * p1 - 3 * p2 + p3) * 0.5,
      ]);
    }
    return curves;
  }

  // Eyes extension: clamped C2 cubic interpolation. The original replicated
  // endpoint kernel remains above for upstream parity; it reverses curvature
  // near the shoulders of a convex lid. Explicit endpoint tangents avoid that.
  function compileSmooth(nodes, firstSlope, lastSlope) {
    if (nodes.length !== 5) throw new RangeError('A lid needs five control points');
    var diagonal = [4, 4, 4], rhs = [], tangent = [firstSlope, 0, 0, 0, lastSlope];
    for (var i = 1; i < 4; i++) rhs.push(3 * (nodes[i + 1] - nodes[i - 1]));
    rhs[0] -= firstSlope;
    rhs[2] -= lastSlope;
    for (var j = 1; j < 3; j++) {
      var factor = 1 / diagonal[j - 1];
      diagonal[j] -= factor;
      rhs[j] -= factor * rhs[j - 1];
    }
    for (var k = 2; k >= 0; k--)
      tangent[k + 1] = (rhs[k] - (k < 2 ? tangent[k + 2] : 0)) / diagonal[k];
    var curves = [];
    for (var n = 0; n < 4; n++) {
      var delta = nodes[n + 1] - nodes[n];
      curves.push([nodes[n], tangent[n], 3 * delta - 2 * tangent[n] - tangent[n + 1],
        -2 * delta + tangent[n] + tangent[n + 1]]);
    }
    return curves;
  }

  function segment(curves, u) {
    var position = Math.max(0, Math.min(4, (u + 1) * 2));
    var index = Math.min(3, Math.floor(position));
    return { curve: curves[index], t: position - index };
  }

  function sample(curves, u) {
    var point = segment(curves, u), c = point.curve, t = point.t;
    return c[0] + t * (c[1] + t * (c[2] + t * c[3]));
  }

  function slope(curves, u, width) {
    var point = segment(curves, u), c = point.curve, t = point.t;
    return (c[1] + t * (2 * c[2] + 3 * c[3] * t)) * 4 / width;
  }

  function edges(eye, u) {
    return { upper: sample(eye.upper, u), lower: sample(eye.lower, u) };
  }

  function surfacePoint(eye, u, v) {
    var edge = edges(eye, u);
    return { x: u * eye.width * 0.5,
      y: (edge.upper + edge.lower) * 0.5 + v * (edge.lower - edge.upper) * 0.5 };
  }

  function trace(ctx, eye) {
    var width = eye.width, step = width / 4;
    ctx.beginPath();
    ctx.moveTo(-width / 2, eye.upper[0][0]);
    for (var i = 0; i < 4; ++i) {
      var c = eye.upper[i], x = -width / 2 + i * step;
      var end = c[0] + c[1] + c[2] + c[3];
      var derivative = c[1] + 2 * c[2] + 3 * c[3];
      ctx.bezierCurveTo(x + step / 3, c[0] + c[1] / 3,
        x + step * 2 / 3, end - derivative / 3, x + step, end);
    }
    ctx.lineTo(width / 2, sample(eye.lower, 1));
    for (var j = 3; j >= 0; --j) {
      var d = eye.lower[j], start = -width / 2 + j * step;
      var finish = d[0] + d[1] + d[2] + d[3];
      var tangent = d[1] + 2 * d[2] + 3 * d[3];
      ctx.bezierCurveTo(start + step * 2 / 3, finish - tangent / 3,
        start + step / 3, d[0] + d[1] / 3, start, d[0]);
    }
    ctx.closePath();
  }

  var api = { catmullRom: catmullRom, compile: compile, compileSmooth: compileSmooth, sample: sample,
    slope: slope, edges: edges, surfacePoint: surfacePoint, trace: trace,
    upstream: 'Sentient Eye Engine', revision: '42761191371f328361b62b5cfd095aac3f58c33d' };
  if (typeof globalThis !== 'undefined') globalThis.SentientEyeRig = api;
  return api;
})();
