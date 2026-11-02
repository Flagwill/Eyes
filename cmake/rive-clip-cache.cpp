// SPDX-FileCopyrightText: 2026 Eyes contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

const QVector<QVector<QVector2D>> &RiveQtRhiRenderer::eyesClipVertices()
{
    // Same clip construction as the pinned drawPath, run only on a cache miss.
    const auto &stack = m_rhiRenderStack.back().m_allClipPainterPathesApplied;
    for (const EyesClipCacheEntry &entry : std::as_const(m_eyesClipCache)) {
        if (entry.stack == stack)
            return entry.vertices;
    }

    RiveQtPath clipResult;
    const QPair<QPainterPath, QMatrix4x4> &firstLevel = stack.first();
    clipResult.setQPainterPath(firstLevel.first);
    clipResult.applyMatrix(firstLevel.second);
    for (int i = 1; i < stack.count(); ++i) {
        RiveQtPath next;
        next.setQPainterPath(stack[i].first);
        next.applyMatrix(stack[i].second);
        clipResult.intersectWith(next.toQPainterPath());
    }

    // A frame clips a handful of distinct outlines. Keep a few across frames so
    // an unchanged pose also reuses them; changed content can never match.
    if (m_eyesClipCache.size() >= 8)
        m_eyesClipCache.removeFirst();
    m_eyesClipCache.append({stack, clipResult.toVertices()});
    return m_eyesClipCache.last().vertices;
}
