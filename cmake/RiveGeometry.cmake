# Resolve vector clipping against the same tessellated triangles before upload.
# This retains Rive's path/paint/state-machine model while removing stencil-only
# draw calls and their screen-sized attachment clears and MSAA resolves.
eyes_replace_scheduling(rive_renderer_source
    "#include \"riveqtpath.h\""
    "#include \"riveqtpath.h\"\n#include \"eyes-triangle-clip.h\"")
# Every clipped highlight or reflection used to rebuild and triangulate the
# whole eye outline that clips it. Rive re-applies the same clip before each
# drawable, so cache the triangulated clip by the exact clip stack (path and
# matrix, compared by value). A hit returns the vertices the old code would have
# recomputed bit for bit; a changed path or matrix can never match.
set(eyes_clip_begin
    "    RiveQtPath clipResult;\n    if (!m_rhiRenderStack.back().m_allClipPainterPathesApplied.empty()) {")
set(eyes_clip_end
    "        node->updateClippingGeometry(clipResult.toVertices());\n    }")
string(FIND "${rive_renderer_source}" "${eyes_clip_begin}" eyes_clip_begin_at)
if(eyes_clip_begin_at LESS 0)
    message(FATAL_ERROR "Pinned Rive drawPath clip layout changed; review clip cache patch")
endif()
string(LENGTH "${eyes_clip_begin}" eyes_clip_begin_length)
math(EXPR eyes_clip_after_begin "${eyes_clip_begin_at} + ${eyes_clip_begin_length}")
string(SUBSTRING "${rive_renderer_source}" ${eyes_clip_after_begin} -1 eyes_clip_rest)
string(FIND "${eyes_clip_rest}" "${eyes_clip_begin}" eyes_clip_duplicate)
if(NOT eyes_clip_duplicate LESS 0)
    message(FATAL_ERROR "Ambiguous Rive drawPath clip patch")
endif()
string(FIND "${eyes_clip_rest}" "${eyes_clip_end}" eyes_clip_end_at)
if(eyes_clip_end_at LESS 0)
    message(FATAL_ERROR "Pinned Rive drawPath clip end changed; review clip cache patch")
endif()
string(LENGTH "${eyes_clip_end}" eyes_clip_end_length)
math(EXPR eyes_clip_tail_at "${eyes_clip_end_at} + ${eyes_clip_end_length}")
string(SUBSTRING "${rive_renderer_source}" 0 ${eyes_clip_begin_at} eyes_clip_head)
string(SUBSTRING "${eyes_clip_rest}" ${eyes_clip_tail_at} -1 eyes_clip_tail)
set(rive_renderer_source "${eyes_clip_head}    if (!m_rhiRenderStack.back().m_allClipPainterPathesApplied.empty()) {\n        pathData = eyes::clipTriangles(pathData, eyesClipVertices(), transformMatrix());\n        node->updateClippingGeometry({});\n    }${eyes_clip_tail}")
file(READ ${CMAKE_CURRENT_SOURCE_DIR}/cmake/rive-clip-cache.cpp rive_clip_cache)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS cmake/rive-clip-cache.cpp)
string(APPEND rive_renderer_source "\n${rive_clip_cache}")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqtrhirenderer.cpp
    CONTENT "${rive_renderer_source}" @ONLY)
file(READ ${rive_qt_src}/renderer/riveqtrhirenderer.h rive_clip_header)
string(REPLACE "\r\n" "\n" rive_clip_header "${rive_clip_header}")
set(rive_renderer_header "${rive_clip_header}")
eyes_replace_scheduling(rive_renderer_header
    "    QVector<TextureTargetNode *> m_renderNodes;"
    "    QVector<TextureTargetNode *> m_renderNodes;\n\n    struct EyesClipCacheEntry\n    {\n        QVector<QPair<QPainterPath, QMatrix4x4>> stack;\n        QVector<QVector<QVector2D>> vertices;\n    };\n    const QVector<QVector<QVector2D>> &eyesClipVertices();\n    QVector<EyesClipCacheEntry> m_eyesClipCache;")
eyes_replace_scheduling(rive_renderer_header
    "#include <QMatrix4x4>"
    "#include <QMatrix4x4>\n#include <QVector2D>")
file(CONFIGURE OUTPUT ${rive_qt_src}/renderer/riveqtrhirenderer.h
    CONTENT "${rive_renderer_header}" @ONLY)

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
