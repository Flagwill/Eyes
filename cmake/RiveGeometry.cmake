# Resolve vector clipping against the same tessellated triangles before upload.
# This retains Rive's path/paint/state-machine model while removing stencil-only
# draw calls and their screen-sized attachment clears and MSAA resolves.
eyes_replace_scheduling(rive_renderer_source
    "#include \"riveqtpath.h\""
    "#include \"riveqtpath.h\"\n#include \"eyes-triangle-clip.h\"")
eyes_replace_scheduling(rive_renderer_source
    "        node->updateClippingGeometry(clipResult.toVertices());"
    "        pathData = eyes::clipTriangles(pathData, clipResult.toVertices(), transformMatrix());\n        node->updateClippingGeometry({});")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqtrhirenderer.cpp
    CONTENT "${rive_renderer_source}" @ONLY)

# Fold the colour clear into the first vector pass instead of resolving an
# empty full-sized multisample attachment before drawing anything.
eyes_replace_scheduling(rive_rhi_source
    "        commandBuffer->beginPass(m_cleanUpTextureTarget, QColor(0, 0, 0, 0), { 1.0f, 0 });\n        commandBuffer->endPass();\n        m_renderer->render(commandBuffer);"
    "        m_renderer->render(commandBuffer);")
eyes_replace_scheduling(rive_rhi_header
    "    QRhiTextureRenderTarget *currentRenderTarget(bool shaderBlending);"
    "    QRhiTextureRenderTarget *currentRenderTarget(bool shaderBlending);\n    QRhiTextureRenderTarget *clearRenderTarget() const { return m_cleanUpTextureTarget; }")
file(CONFIGURE OUTPUT ${rive_qt_src}/riveqsgrhirendernode.h
    CONTENT "${rive_rhi_header}" @ONLY)
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqsgrhirendernode.cpp
    CONTENT "${rive_rhi_source}" @ONLY)
