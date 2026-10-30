# Source-over scenes need one multisample colour surface. Defer the two
# destination-reading blend surfaces until an active path actually needs them.
file(READ ${rive_qt_src}/renderer/riveqtrhirenderer.h rive_renderer_header)
string(REPLACE "\r\n" "\n" rive_renderer_header "${rive_renderer_header}")
eyes_replace_scheduling(rive_renderer_header
    "    void render(QRhiCommandBuffer *cb) const;"
    "    void render(QRhiCommandBuffer *cb) const;\n    bool needsBlendBuffers() const;")
file(CONFIGURE OUTPUT ${rive_qt_src}/renderer/riveqtrhirenderer.h
    CONTENT "${rive_renderer_header}" @ONLY)
string(APPEND rive_renderer_source "\nbool RiveQtRhiRenderer::needsBlendBuffers() const\n{\n    for (const auto *node : std::as_const(m_renderNodes))\n        if (!node->isRecycled() && !node->canBatch()) return true;\n    return false;\n}\n")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqtrhirenderer.cpp
    CONTENT "${rive_renderer_source}" @ONLY)

eyes_replace_scheduling(rive_rhi_source
    "    m_renderSurfaceB.create(rhi, m_sampleCount, QSize(m_rect.width(), m_rect.height()), m_stencilClippingBuffer);\n    m_renderSurfaceIntern.create(rhi, m_sampleCount, QSize(m_rect.width(), m_rect.height()), m_stencilClippingBuffer, {});"
    "    // Destination-reading surfaces are allocated after preparing active paths.")
eyes_replace_scheduling(rive_rhi_source
    "    if (eyesRedraw) artboardInstance->draw(m_renderer);"
    "    if (eyesRedraw) artboardInstance->draw(m_renderer);\n    if (m_renderer->needsBlendBuffers() && !m_renderSurfaceB.valid()) {\n        m_renderSurfaceB.create(rhi, m_sampleCount, QSize(m_rect.width(), m_rect.height()), m_stencilClippingBuffer);\n        m_renderSurfaceIntern.create(rhi, m_sampleCount, QSize(m_rect.width(), m_rect.height()), m_stencilClippingBuffer, {});\n        // Held composition and SMAA bindings initially alias A. Rebind once if\n        // a later frame introduces destination-reading paint.\n        if (m_finalDrawResourceBindings) {\n            m_cleanupList.removeAll(m_finalDrawResourceBindings);\n            delete m_finalDrawResourceBindings;\n            m_finalDrawResourceBindings = nullptr;\n        }\n        if (m_postprocessing) m_postprocessing->cleanup();\n    }")
eyes_replace_scheduling(rive_rhi_source
    "    return m_renderSurfaceB.texture;"
    "    return m_renderSurfaceB.valid() ? m_renderSurfaceB.texture : m_renderSurfaceA.texture;")
eyes_replace_scheduling(rive_rhi_source
    "    return m_renderSurfaceIntern.texture;"
    "    return m_renderSurfaceIntern.valid() ? m_renderSurfaceIntern.texture : m_dummyTexture;")
eyes_replace_scheduling(rive_rhi_source
    "    if (!m_renderSurfaceA.valid() || !m_renderSurfaceB.valid() || !m_renderSurfaceIntern.valid() || m_rect.width() == 0"
    "    if (!m_renderSurfaceA.valid() || m_rect.width() == 0")
eyes_replace_scheduling(rive_rhi_source
    "m_drawPipelineIntern = createDrawPipeline(rhi, false, true, m_renderSurfaceIntern.desc,"
    "m_drawPipelineIntern = createDrawPipeline(rhi, false, true, m_renderSurfaceA.desc,")
# The node-level blend bindings establish a layout only. TextureTargetNode
# binds the real blend surfaces when a destination-reading draw is submitted.
eyes_replace_scheduling(rive_rhi_source
    "sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, m_renderSurfaceB.texture,"
    "sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, getRenderBufferB(),")
string(REGEX MATCHALL "m_renderSurfaceIntern[.]texture," rive_intern_bindings "${rive_rhi_source}")
list(LENGTH rive_intern_bindings rive_intern_binding_count)
if(NOT rive_intern_binding_count EQUAL 2)
    message(FATAL_ERROR "Pinned Rive intermediate bindings changed; review lazy resource adaptation")
endif()
string(REPLACE "m_renderSurfaceIntern.texture," "getRenderBufferIntern()," rive_rhi_source "${rive_rhi_source}")
eyes_replace_scheduling(rive_rhi_source
    "m_renderSurfaceA.texture, m_renderSurfaceB.texture);"
    "m_renderSurfaceA.texture, getRenderBufferB());")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqsgrhirendernode.cpp
    CONTENT "${rive_rhi_source}" @ONLY)
