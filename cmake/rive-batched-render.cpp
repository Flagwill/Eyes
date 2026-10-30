// SPDX-FileCopyrightText: 2026 Eyes contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

void RiveQtRhiRenderer::render(QRhiCommandBuffer *cb) const
{
    // QRhi uploads must be outside a render pass. Every path has its own
    // uniforms and buffers, so later uploads cannot overwrite earlier draws.
    for (TextureTargetNode *node : std::as_const(m_renderNodes)) {
        if (!node->isRecycled() && node->canBatch())
            node->prepareBatch(cb);
    }

    const TextureTargetNode *batch = nullptr;
    bool firstPass = true;
    for (TextureTargetNode *node : std::as_const(m_renderNodes)) {
        if (node->isRecycled())
            continue;
        if (!node->canBatch()) {
            // Destination-reading blend modes retain the upstream ping-pong
            // path, with their original position in the paint order.
            if (batch) {
                cb->endPass();
                batch = nullptr;
            }
            if (firstPass) {
                cb->beginPass(m_node->clearRenderTarget(), QColor(0, 0, 0, 0), {1.0f, 0});
                cb->endPass();
                firstPass = false;
            }
            node->render(cb);
            continue;
        }
        // A new mask (or an unclipped prop) needs a fresh stencil clear. Keep
        // the existing reference and pipelines for identical clip geometry.
        if (batch && !node->hasSameClip(*batch)) {
            cb->endPass();
            batch = nullptr;
        }
        if (!batch) {
            cb->beginPass(firstPass ? m_node->clearRenderTarget() : m_node->currentRenderTarget(false),
                QColor(0, 0, 0, 0), {1.0f, 0});
            firstPass = false;
            batch = node;
        }
        node->render(cb, true);
    }
    if (batch)
        cb->endPass();
    if (firstPass) {
        cb->beginPass(m_node->clearRenderTarget(), QColor(0, 0, 0, 0), {1.0f, 0});
        cb->endPass();
    }
}
