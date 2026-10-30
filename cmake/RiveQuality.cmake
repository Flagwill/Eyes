# Hardware MSAA already covers geometry at native pixel density. Avoid an
# additional full-target SMAA filter when at least four samples are available;
# keep SMAA for low-sample backends and as an explicitly selectable mode.
file(READ ${rive_qt_src}/datatypes.h rive_types_header)
string(REPLACE "\r\n" "\n" rive_types_header "${rive_types_header}")
eyes_replace_scheduling(rive_types_header
    "        SMAA = 0x01"
    "        SMAA = 0x01,\n        Automatic = 0x02")
file(CONFIGURE OUTPUT ${rive_qt_src}/datatypes.h CONTENT "${rive_types_header}" @ONLY)
eyes_replace_scheduling(rive_rhi_header
    "    PostprocessingSMAA *m_postprocessing { nullptr };"
    "    PostprocessingSMAA *m_postprocessing { nullptr };\n    bool m_automaticAntialiasing = false;")
eyes_replace_scheduling(rive_rhi_source
    "    if (postprocessingMode == RiveRenderSettings::None) {"
    "    m_automaticAntialiasing = postprocessingMode == RiveRenderSettings::Automatic;\n    if (postprocessingMode == RiveRenderSettings::None || m_automaticAntialiasing) {")
eyes_replace_scheduling(rive_rhi_source
    "    m_sampleCount = sampleCount;\n    if (!m_stencilClippingBuffer) {"
    "    m_sampleCount = sampleCount;\n    if (m_automaticAntialiasing && m_sampleCount < 4 && !m_postprocessing)\n        m_postprocessing = new PostprocessingSMAA(m_window->rendererInterface()->graphicsApi());\n    if (!m_stencilClippingBuffer) {")
file(CONFIGURE OUTPUT ${rive_qt_src}/riveqsgrhirendernode.h
    CONTENT "${rive_rhi_header}" @ONLY)
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqsgrhirendernode.cpp
    CONTENT "${rive_rhi_source}" @ONLY)
