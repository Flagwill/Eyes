# Adapt the checksum-pinned LGPL bridge without modifying downloaded sources.
# Fail if an upstream edit makes any of these targeted replacements ambiguous.
file(READ ${rive_qt_src}/riveqsgrhirendernode.cpp rive_rhi_source)
string(REPLACE "\r\n" "\n" rive_rhi_source "${rive_rhi_source}")
function(eyes_replace_rive_rhi before after)
    string(FIND "${rive_rhi_source}" "${before}" start)
    if(start LESS 0)
        message(FATAL_ERROR "Pinned Rive RHI layout changed; review antialiasing patch: ${before}")
    endif()
    string(LENGTH "${before}" count)
    math(EXPR end "${start} + ${count}")
    string(SUBSTRING "${rive_rhi_source}" ${end} -1 tail)
    string(FIND "${tail}" "${before}" duplicate)
    if(NOT duplicate LESS 0)
        message(FATAL_ERROR "Ambiguous Rive antialiasing patch: ${before}")
    endif()
    string(REPLACE "${before}" "${after}" source "${rive_rhi_source}")
    set(rive_rhi_source "${source}" PARENT_SCOPE)
endfunction()

# Geometry coverage must not depend on Plasma's window-wide sample count.
# Keep the final pass compatible with its own (possibly single-sample) target.
eyes_replace_rive_rhi("    if (!m_stencilClippingBuffer) {\n        m_stencilClippingBuffer = rhi->newRenderBuffer"
    "    sampleCount = 1;\n    if (rhi->backend() != QRhi::Metal && rhi->isFeatureSupported(QRhi::MultisampleRenderBuffer)) {\n        const auto supported = rhi->supportedSampleCounts();\n        for (int candidate : {8, 4, 2}) {\n            if (supported.contains(candidate)) { sampleCount = candidate; break; }\n        }\n    }\n    m_sampleCount = sampleCount;\n    if (!m_stencilClippingBuffer) {\n        m_stencilClippingBuffer = rhi->newRenderBuffer")
eyes_replace_rive_rhi("    clipPipeLine->setRenderPassDescriptor(renderPassDescriptor);"
    "    clipPipeLine->setSampleCount(m_sampleCount);\n    clipPipeLine->setRenderPassDescriptor(renderPassDescriptor);")
eyes_replace_rive_rhi("    drawPipeLine->setRenderPassDescriptor(renderPassDescriptor);"
    "    drawPipeLine->setSampleCount(stencilBuffer ? m_sampleCount\n        : QSGRenderNodePrivate::get(this)->m_rt.rt->sampleCount());\n    drawPipeLine->setRenderPassDescriptor(renderPassDescriptor);")
eyes_replace_rive_rhi("    blendPipeLine->setRenderPassDescriptor(renderPass);"
    "    blendPipeLine->setSampleCount(m_sampleCount);\n    blendPipeLine->setRenderPassDescriptor(renderPass);")

# The resolved texture is premultiplied. Multiplying by alpha again gives
# partially covered pixels a dark fringe. Linear reconstruction also prevents
# nearest-neighbour steps when the whole rig moves by a fractional pixel.
eyes_replace_rive_rhi("        blend.srcColor = QRhiGraphicsPipeline::SrcAlpha;"
    "        blend.srcColor = stencilBuffer ? QRhiGraphicsPipeline::SrcAlpha : QRhiGraphicsPipeline::One;")
foreach(buffer A B)
    eyes_replace_rive_rhi("getRenderBuffer${buffer}(), m_sampler)"
        "getRenderBuffer${buffer}(), m_blendSampler)")
endforeach()
eyes_replace_rive_rhi("postprocessedBuffer, m_sampler)"
    "postprocessedBuffer, m_blendSampler)")

# RiveScheduling applies the remaining adaptation and writes the source once,
# avoiding needless recompilation on every configure/install.
list(REMOVE_ITEM rive_qt_sources ${rive_qt_src}/riveqsgrhirendernode.cpp)
list(APPEND rive_qt_sources ${CMAKE_CURRENT_BINARY_DIR}/riveqsgrhirendernode.cpp)
