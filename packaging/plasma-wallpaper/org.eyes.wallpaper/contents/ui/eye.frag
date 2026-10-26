#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 surfaceSize;
    vec2 surfaceOrigin;
    vec4 eyeGeometry;
    vec4 upper0;
    vec4 upper1;
    vec4 upper2;
    vec4 upper3;
    vec4 lower0;
    vec4 lower1;
    vec4 lower2;
    vec4 lower3;
    vec4 lightGeometry;
    vec4 lightDetail;
    vec4 fragmentGeometryA;
    vec4 fragmentDetailA;
    vec4 fragmentGeometryB;
    vec4 fragmentDetailB;
};

// Coefficients are compiled once by the shared Sentient rig in JavaScript.
// The shader only evaluates them, so it cannot invent a second set of poses.
float cubic(vec4 c, float t) {
    return c.x + t * (c.y + t * (c.z + t * c.w));
}

vec2 lidEdges(float u) {
    float position = clamp((u + 1.0) * 2.0, 0.0, 4.0);
    float index = min(3.0, floor(position));
    vec4 upper = index < 0.5 ? upper0 : index < 1.5 ? upper1 : index < 2.5 ? upper2 : upper3;
    vec4 lower = index < 0.5 ? lower0 : index < 1.5 ? lower1 : index < 2.5 ? lower2 : lower3;
    return vec2(cubic(upper, position - index), cubic(lower, position - index));
}

float surfaceLight(vec2 uv, vec4 geometry, vec4 detail) {
    vec2 q = (uv - geometry.xy) / max(vec2(0.001), geometry.zw);
    float distance = detail.x > 0.5 ? max(abs(q.x), abs(q.y)) : length(q);
    float start = detail.x > 0.5 ? 0.68 : 0.16;
    return (1.0 - smoothstep(start, 1.0, distance)) * detail.z;
}

void main() {
    vec2 p = qt_TexCoord0 * surfaceSize + surfaceOrigin;
    float u = 2.0 * p.x / eyeGeometry.x;
    vec2 lids = lidEdges(u);
    vec2 edges = vec2(abs(p.x) - eyeGeometry.x * 0.5,
        max(lids.x - p.y, p.y - lids.y));
    // Pixel-sized antialiasing only. The internal material never affects alpha.
    vec2 pixelWidth = max(fwidth(edges), vec2(0.0001));
    vec2 edgeCoverage = clamp(vec2(0.5) - edges / pixelWidth, vec2(0.0), vec2(1.0));
    float coverage = edgeCoverage.x * edgeCoverage.y;

    // Match the Canvas base gradient in unrotated local coordinates.
    float top = -eyeGeometry.y * 0.5;
    float bottom = eyeGeometry.y * 0.5;
    float vertical = clamp((p.y - top) / max(0.1, bottom - top), 0.0, 1.0);
    vec3 color = mix(vec3(156.0, 105.0, 222.0), vec3(142.0, 82.0, 213.0),
                     min(1.0, vertical / 0.55)) / 255.0;
    color = mix(color, vec3(125.0, 69.0, 196.0) / 255.0,
                max(0.0, (vertical - 0.55) / 0.45));

    // v follows the full curve, rather than a flat tangent-plane approximation.
    float thickness = max(0.01, lids.y - lids.x);
    float v = (2.0 * p.y - lids.x - lids.y) / thickness;
    vec2 uv = vec2(u, v);
    float light = 1.0 - (1.0 - surfaceLight(uv, lightGeometry, lightDetail)) *
        (1.0 - surfaceLight(uv, fragmentGeometryA, fragmentDetailA)) *
        (1.0 - surfaceLight(uv, fragmentGeometryB, fragmentDetailB));
    color = mix(color, vec3(202.0, 166.0, 235.0) / 255.0, min(0.24, light));
    fragColor = vec4(color * coverage, coverage) * qt_Opacity;
}
