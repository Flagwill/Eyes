// SPDX-FileCopyrightText: 2026 Eyes contributors
// SPDX-License-Identifier: LGPL-3.0-or-later
#pragma once

#include <QMatrix4x4>
#include <QVector>
#include <QVector2D>
#include <array>
#include <algorithm>
#include <cmath>

namespace eyes {
using TriangleMesh = QVector<QVector<QVector2D>>;

// Retain each vertex's original paint coordinates while intersecting the
// already tessellated meshes in artboard space. Gradients still interpolate
// the same local coordinates in the unchanged native fragment shader.
inline TriangleMesh clipTriangles(const TriangleMesh &source, const TriangleMesh &mask,
                                  const QMatrix4x4 &transform)
{
    struct Vertex { double x, y; QVector2D paint; };
    struct Triangle {
        std::array<QVector2D, 3> p;
        double winding, left, top, right, bottom;
    };
    const auto cross = [](double ax, double ay, double bx, double by) { return ax * by - ay * bx; };
    QVector<Triangle> clips;
    for (const auto &part : mask) for (qsizetype i = 0; i + 2 < part.size(); i += 3) {
        const auto a = part[i], b = part[i + 1], c = part[i + 2];
        const double area = cross(double(b.x()) - a.x(), double(b.y()) - a.y(),
                                  double(c.x()) - a.x(), double(c.y()) - a.y());
        if (area == 0) continue;
        clips.append({{a,b,c}, area > 0 ? 1.0 : -1.0,
            std::min({a.x(), b.x(), c.x()}), std::min({a.y(), b.y(), c.y()}),
            std::max({a.x(), b.x(), c.x()}), std::max({a.y(), b.y(), c.y()})});
    }
    QVector<QVector2D> output;
    for (const auto &part : source) for (qsizetype i = 0; i + 2 < part.size(); i += 3) {
        std::array<Vertex, 8> original{};
        for (int j = 0; j < 3; ++j) {
            const auto p = part[i + j];
            original[j] = {double(transform(0,0))*p.x() + double(transform(0,1))*p.y() + transform(0,3),
                double(transform(1,0))*p.x() + double(transform(1,1))*p.y() + transform(1,3), p};
        }
        const double left = std::min({original[0].x,original[1].x,original[2].x});
        const double right = std::max({original[0].x,original[1].x,original[2].x});
        const double top = std::min({original[0].y,original[1].y,original[2].y});
        const double bottom = std::max({original[0].y,original[1].y,original[2].y});
        for (const auto &clip : clips) {
            if (right < clip.left || left > clip.right || bottom < clip.top || top > clip.bottom) continue;
            auto polygon = original;
            int count = 3;
            for (int edge = 0; edge < 3 && count; ++edge) {
                const auto a = clip.p[edge], b = clip.p[(edge + 1) % 3];
                const auto distance = [&](const Vertex &p) {
                    return clip.winding * cross(double(b.x()) - a.x(), double(b.y()) - a.y(), p.x - a.x(), p.y - a.y());
                };
                std::array<Vertex, 8> next{};
                int size = 0;
                Vertex previous = polygon[count - 1];
                double previousDistance = distance(previous);
                for (int j = 0; j < count; ++j) {
                    const Vertex current = polygon[j];
                    const double currentDistance = distance(current);
                    if ((currentDistance >= 0) != (previousDistance >= 0) &&
                        currentDistance != 0 && previousDistance != 0) {
                        const double t = previousDistance / (previousDistance - currentDistance);
                        next[size++] = {previous.x + t * (current.x - previous.x),
                            previous.y + t * (current.y - previous.y),
                            previous.paint + float(t) * (current.paint - previous.paint)};
                    }
                    if (currentDistance >= 0) next[size++] = current;
                    previous = current;
                    previousDistance = currentDistance;
                }
                polygon = next;
                count = size;
            }
            for (int j = 1; j + 1 < count; ++j) {
                const auto a = polygon[0].paint, b = polygon[j].paint, c = polygon[j + 1].paint;
                if (cross(double(b.x())-a.x(),double(b.y())-a.y(),double(c.x())-a.x(),double(c.y())-a.y()) == 0) continue;
                output << a << b << c;
            }
        }
    }
    return {output};
}
} // namespace eyes
