#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 surfaceSize;
    vec2 surfaceOrigin;
    vec4 eyeGeometry;
    vec4 lightGeometry;
    vec4 lightDetail;
    vec4 fragmentGeometryA;
    vec4 fragmentDetailA;
    vec4 fragmentGeometryB;
    vec4 fragmentDetailB;
};

vec2 bandEdges(vec2 p, vec2 size, float bend) {
    // Both long edges share a parabola, so happy eyes retain equal thickness.
    p.y += bend * (1.0 - 4.0 * p.x * p.x / (size.x * size.x));
    return abs(p) - size * 0.5;
}

float softBand(vec2 edges, float softness) {
    // Independent fades meet gently at a square corner without a diagonal cusp.
    vec2 coverage = vec2(0.5) - vec2(0.5) * tanh(edges / (softness * 0.75));
    return coverage.x * coverage.y;
}

float surfaceLight(vec2 p, vec4 geometry, vec4 detail) {
    vec2 point = p - geometry.xy;
    point.y -= detail.y * point.x;
    vec2 edges = bandEdges(point, geometry.zw, detail.x);
    float softness = max(0.15, min(geometry.z, geometry.w) * 0.18);
    return softBand(edges, softness) * detail.z;
}

void main() {
    vec2 p = qt_TexCoord0 * surfaceSize + surfaceOrigin;
    vec2 edges = bandEdges(p, eyeGeometry.xy, eyeGeometry.z);
    float aa = max(fwidth(edges.x), fwidth(edges.y));
    float softness = max(aa, min(eyeGeometry.x, eyeGeometry.y) * 0.045);
    float coverage = softBand(edges, softness);

    float surfaceY = p.y + eyeGeometry.z *
        (1.0 - 4.0 * p.x * p.x / (eyeGeometry.x * eyeGeometry.x));
    float vertical = clamp(surfaceY / eyeGeometry.y + 0.5, 0.0, 1.0);
    vec3 color = vec3(146.0, 86.0, 224.0) / 255.0;
    color = mix(color, vec3(219.0, 179.0, 255.0) / 255.0,
                0.17 * max(0.0, 1.0 - vertical / 0.55));
    color = mix(color, vec3(87.0, 36.0, 165.0) / 255.0,
                0.1 * max(0.0, (vertical - 0.55) / 0.45));

    float light = surfaceLight(p, lightGeometry, lightDetail);
    light += surfaceLight(p, fragmentGeometryA, fragmentDetailA);
    light += surfaceLight(p, fragmentGeometryB, fragmentDetailB);
    color = mix(color, vec3(220.0, 183.0, 251.0) / 255.0, light);

    float glowWidth = 12.0 + eyeGeometry.w * 10.0;
    float glow = softBand(edges, glowWidth) * (0.08 + eyeGeometry.w * 0.12);
    float alpha = coverage + glow * (1.0 - coverage);
    vec3 premultiplied = color * coverage +
        vec3(153.0, 84.0, 235.0) / 255.0 * glow * (1.0 - coverage);
    fragColor = vec4(premultiplied, alpha) * qt_Opacity;
}
