# Coalesce consecutive source-over paths with identical stencil coverage.
# Upstream resolves the entire MSAA target after every path; a shared pass
# avoids those resolves while preserving paint order and per-sample clipping.
file(READ ${rive_qt_src}/rhi/texturetargetnode.h rive_target_header)
string(REPLACE "\r\n" "\n" rive_target_header "${rive_target_header}")
eyes_replace_scheduling(rive_target_header
    "    void render(QRhiCommandBuffer *cb);"
    "    bool canBatch() const { return !m_shaderBlending; }\n    bool hasSameClip(const TextureTargetNode &other) const {\n        return m_clip == other.m_clip && (!m_clip || m_clippingData == other.m_clippingData);\n    }\n    void prepareBatch(QRhiCommandBuffer *cb);\n    void render(QRhiCommandBuffer *cb, bool batched = false);")
file(CONFIGURE OUTPUT ${rive_qt_src}/rhi/texturetargetnode.h
    CONTENT "${rive_target_header}" @ONLY)

eyes_replace_scheduling(rive_target_source
    "void TextureTargetNode::render(QRhiCommandBuffer *commandBuffer)"
    "void TextureTargetNode::prepareBatch(QRhiCommandBuffer *commandBuffer)\n{\n    prepareRender();\n    commandBuffer->resourceUpdate(m_resourceUpdates);\n    m_resourceUpdates = nullptr;\n}\n\nvoid TextureTargetNode::render(QRhiCommandBuffer *commandBuffer, bool batched)")
eyes_replace_scheduling(rive_target_source
    "    prepareRender();\n\n    auto *currentDisplayBufferTarget"
    "    if (!batched) prepareRender();\n\n    auto *currentDisplayBufferTarget")
eyes_replace_scheduling(rive_target_source
    "    commandBuffer->beginPass(currentDisplayBufferTarget, QColor(0, 0, 0, 0), { 1.0f, 0 }, m_resourceUpdates);"
    "    if (!batched)\n        commandBuffer->beginPass(currentDisplayBufferTarget, QColor(0, 0, 0, 0), { 1.0f, 0 }, m_resourceUpdates);")
eyes_replace_scheduling(rive_target_source
    "    commandBuffer->endPass();\n\n    if (m_shaderBlending)"
    "    if (!batched) commandBuffer->endPass();\n\n    if (m_shaderBlending)")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/texturetargetnode.cpp
    CONTENT "${rive_target_source}" @ONLY)

file(READ ${CMAKE_CURRENT_SOURCE_DIR}/cmake/rive-batched-render.cpp rive_batch_render)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS cmake/rive-batched-render.cpp)
eyes_replace_scheduling(rive_renderer_source
    "#include \"renderer/riveqtrhirenderer.h\""
    "#include \"renderer/riveqtrhirenderer.h\"\n#include \"riveqsgrhirendernode.h\"\n#include <private/qrhi_p.h>")
eyes_replace_scheduling(rive_renderer_source
    "void RiveQtRhiRenderer::render(QRhiCommandBuffer *cb) const\n{\n    for (TextureTargetNode *textureTargetNode : std::as_const(m_renderNodes)) {\n        textureTargetNode->render(cb);\n    }\n}"
    "${rive_batch_render}")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqtrhirenderer.cpp
    CONTENT "${rive_renderer_source}" @ONLY)
