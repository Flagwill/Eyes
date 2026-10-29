# Demand-driven scheduling for the checksum-pinned LGPL Qt bridge. The asset
# contains static basis poses; the shared model is its only animation clock.
function(eyes_replace_scheduling variable before after)
    set(source "${${variable}}")
    string(FIND "${source}" "${before}" start)
    if(start LESS 0)
        message(FATAL_ERROR "Pinned Rive scheduling layout changed: ${before}")
    endif()
    string(LENGTH "${before}" count)
    math(EXPR end "${start} + ${count}")
    string(SUBSTRING "${source}" ${end} -1 tail)
    string(FIND "${tail}" "${before}" duplicate)
    if(NOT duplicate LESS 0)
        message(FATAL_ERROR "Ambiguous Rive scheduling patch: ${before}")
    endif()
    string(REPLACE "${before}" "${after}" source "${source}")
    set(${variable} "${source}" PARENT_SCOPE)
endfunction()

file(READ ${rive_qt_src}/riveqtquickitem.cpp rive_item_source)
string(REPLACE "\r\n" "\n" rive_item_source "${rive_item_source}")
# The shared model explicitly dirties the item after changing its inputs.
eyes_replace_scheduling(rive_item_source
    "    this->update();\n\n    if (et.isValid())"
    "    // No independent animation loop: Eyes advances the shared model.\n\n    if (et.isValid())")
eyes_replace_scheduling(rive_item_source
    "    connect(currentWindow, &QQuickWindow::beforeSynchronizing, this, &RiveQtQuickItem::updateStateMachineValues,\n            static_cast<Qt::ConnectionType>(Qt::DirectConnection | Qt::UniqueConnection));"
    "    // Eyes inputs flow from the model to Rive; no reverse polling is needed.")
# GPU work belongs to QSGRenderNode::prepare, after the synchronized artboard
# has prepared its paths, and before Qt starts the main render pass.
eyes_replace_scheduling(rive_item_source
    "        connect(currentWindow, &QQuickWindow::beforeFrameBegin, this, &RiveQtQuickItem::renderOffscreen,\n                static_cast<Qt::ConnectionType>(Qt::DirectConnection | Qt::UniqueConnection));"
    "        // RHI vector passes are submitted in prepare() on this frame's command buffer.")
eyes_replace_scheduling(rive_item_source
    "#if QT_VERSION < QT_VERSION_CHECK(6, 0, 0)\n    // in qt6 this is done in the offscreen render call"
    "    // Synchronize output geometry before preparing this frame's vector passes.")
eyes_replace_scheduling(rive_item_source
    "        m_geometryChanged = false;\n    }\n#endif"
    "        m_geometryChanged = false;\n    }\n    if (auto *rhiNode = dynamic_cast<RiveQSGRHIRenderNode *>(m_renderNode))\n        rhiNode->requestFrame();")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqtquickitem.cpp
    CONTENT "${rive_item_source}" @ONLY)
list(REMOVE_ITEM rive_qt_sources ${rive_qt_src}/riveqtquickitem.cpp)
list(APPEND rive_qt_sources ${CMAKE_CURRENT_BINARY_DIR}/riveqtquickitem.cpp)

file(READ ${rive_qt_src}/rivestatemachineinput.cpp rive_input_source)
string(REPLACE "\r\n" "\n" rive_input_source "${rive_input_source}")
# Apply the shared model as one changed-key batch. Declaring every Rive input
# as a QML property creates notifications and meta-object lookups for each of
# the 150+ static controls on every frame.
eyes_replace_scheduling(rive_input_source
    "QVariant RiveStateMachineInput::getRiveProperty(const QString &propertyName) const"
    "void RiveStateMachineInput::updateInputs(const QVariantMap &values)\n{\n    for (auto it = values.cbegin(); it != values.cend(); ++it) {\n        if (!it.value().isValid())\n            continue;\n        if (m_inputValues.contains(it.key()) && m_inputValues.value(it.key()) == it.value())\n            continue;\n        m_inputValues.insert(it.key(), it.value());\n        setRiveProperty(it.key(), it.value());\n    }\n}\n\nQVariant RiveStateMachineInput::getRiveProperty(const QString &propertyName) const")
eyes_replace_scheduling(rive_input_source
    "    connectStateMachineToProperties();\n    generateStringInterface();\n}"
    "    connectStateMachineToProperties();\n    generateStringInterface();\n\n    // A scene can receive held values before its artboard finishes loading.\n    for (auto it = m_inputValues.cbegin(); it != m_inputValues.cend(); ++it)\n        setRiveProperty(it.key(), it.value());\n}")
# setRiveProperty stays silent until the component completes, so a batch that
# arrived during construction was dropped. Replay it once the object is ready.
eyes_replace_scheduling(rive_input_source
    "void RiveStateMachineInput::componentComplete()\n{\n    m_isCompleted = true;\n    connectStateMachineToProperties();\n}"
    "void RiveStateMachineInput::componentComplete()\n{\n    m_isCompleted = true;\n    connectStateMachineToProperties();\n\n    // Replay the batch that arrived before this object could accept values.\n    for (auto it = m_inputValues.cbegin(); it != m_inputValues.cend(); ++it)\n        setRiveProperty(it.key(), it.value());\n}")
# Initialize held inputs as soon as an artboard is loaded. A sleeping model
# must not depend on a subsequent animation tick to populate the native state.
eyes_replace_scheduling(rive_input_source
    "            connect(this, property.notifySignal(), this, handlePropertyChangedMethod);"
    "            setRiveProperty(propertyName, propertyValue);\n            connect(this, property.notifySignal(), this, handlePropertyChangedMethod, Qt::UniqueConnection);")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/rivestatemachineinput.cpp
    CONTENT "${rive_input_source}" @ONLY)
list(REMOVE_ITEM rive_qt_sources ${rive_qt_src}/rivestatemachineinput.cpp)
list(APPEND rive_qt_sources ${CMAKE_CURRENT_BINARY_DIR}/rivestatemachineinput.cpp)

file(READ ${rive_qt_src}/rivestatemachineinput.h rive_input_header)
string(REPLACE "\r\n" "\n" rive_input_header "${rive_input_header}")
eyes_replace_scheduling(rive_input_header
    "    Q_INVOKABLE void setRiveProperty(const QString &propertyName, const QVariant &value);"
    "    Q_INVOKABLE void setRiveProperty(const QString &propertyName, const QVariant &value);\n    Q_INVOKABLE void updateInputs(const QVariantMap &values);")
eyes_replace_scheduling(rive_input_header
    "    QVariantMap m_generatedRivePropertyMap;"
    "    QVariantMap m_generatedRivePropertyMap;\n    QVariantMap m_inputValues;")
file(CONFIGURE OUTPUT ${rive_qt_src}/rivestatemachineinput.h
    CONTENT "${rive_input_header}" @ONLY)

file(READ ${rive_qt_upstream}/riveqsgrhirendernode.h rive_rhi_header)
string(REPLACE "\r\n" "\n" rive_rhi_header "${rive_rhi_header}")
eyes_replace_scheduling(rive_rhi_header
    "    bool m_verticesDirty = true;"
    "    bool m_eyesDirty = true;\n    bool m_verticesDirty = true;")
eyes_replace_scheduling(rive_rhi_header
    "    void prepare() override;"
    "    void prepare() override;\n    void requestFrame() { m_eyesDirty = true; }")
file(CONFIGURE OUTPUT ${rive_qt_src}/riveqsgrhirendernode.h
    CONTENT "${rive_rhi_header}" @ONLY)
list(APPEND rive_qt_sources ${rive_qt_src}/riveqsgrhirendernode.h)
list(REMOVE_DUPLICATES rive_qt_sources)

file(READ ${rive_qt_src}/renderer/riveqtrhirenderer.cpp rive_renderer_source)
string(REPLACE "\r\n" "\n" rive_renderer_source "${rive_renderer_source}")
# prepare() calls this every model update. Reuse the nodes and their RHI
# buffers while geometry is unchanged; only an actual resize invalidates them.
eyes_replace_scheduling(rive_renderer_source
    "void RiveQtRhiRenderer::updateViewPort(const QRectF &viewportRect)\n{\n    while (!m_renderNodes.empty()) {"
    "void RiveQtRhiRenderer::updateViewPort(const QRectF &viewportRect)\n{\n    if (m_viewportRect == viewportRect)\n        return;\n\n    while (!m_renderNodes.empty()) {")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqtrhirenderer.cpp
    CONTENT "${rive_renderer_source}" @ONLY)
list(REMOVE_ITEM rive_qt_sources ${rive_qt_src}/renderer/riveqtrhirenderer.cpp)
list(APPEND rive_qt_sources ${CMAKE_CURRENT_BINARY_DIR}/riveqtrhirenderer.cpp)

file(READ ${rive_qt_src}/rhi/texturetargetnode.cpp rive_target_source)
string(REPLACE "\r\n" "\n" rive_target_source "${rive_target_source}")
string(REPLACE "#include \"texturetargetnode.h\"" "#include \"rhi/texturetargetnode.h\"" rive_target_source "${rive_target_source}")
# Reused nodes must upload the current path even when it is shorter than the
# previous one. Upstream's shrink branch only cleared the dynamic buffers; that
# was hidden by the old renderer recreating every node on each frame.
eyes_replace_scheduling(rive_target_source
    "    if (m_oldBufferSize > m_geometryData.size()) {\n        m_resourceUpdates->updateDynamicBuffer(m_vertexBuffer, 0,\n                                               qMin((unsigned long long)m_clearData.size(), m_maximumVerticies * sizeof(QVector2D)),\n                                               m_clearData.constData());\n        m_resourceUpdates->updateDynamicBuffer(m_clippingVertexBuffer, 0,\n                                               qMin((unsigned long long)m_clearData.size(), m_maximumClippingVerticies * sizeof(QVector2D)),\n                                               m_clearData.constData());\n    } else {\n        m_resourceUpdates->updateDynamicBuffer(m_vertexBuffer, 0,\n                                               qMin((unsigned long long)m_geometryData.size(), m_maximumVerticies * sizeof(QVector2D)),\n                                               m_geometryData.constData());\n        m_resourceUpdates->updateDynamicBuffer(\n            m_clippingVertexBuffer, 0, qMin((unsigned long long)m_clippingData.size(), m_maximumClippingVerticies * sizeof(QVector2D)),\n            m_clippingData.constData());\n    }"
    "    if (!m_geometryData.isEmpty()) {\n        m_resourceUpdates->updateDynamicBuffer(m_vertexBuffer, 0,\n                                               qMin((unsigned long long)m_geometryData.size(), m_maximumVerticies * sizeof(QVector2D)),\n                                               m_geometryData.constData());\n    }\n    if (!m_clippingData.isEmpty()) {\n        m_resourceUpdates->updateDynamicBuffer(\n            m_clippingVertexBuffer, 0, qMin((unsigned long long)m_clippingData.size(), m_maximumClippingVerticies * sizeof(QVector2D)),\n            m_clippingData.constData());\n    }")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/texturetargetnode.cpp
    CONTENT "${rive_target_source}" @ONLY)
list(REMOVE_ITEM rive_qt_sources ${rive_qt_src}/rhi/texturetargetnode.cpp)
list(APPEND rive_qt_sources ${CMAKE_CURRENT_BINARY_DIR}/texturetargetnode.cpp)

# RiveAntialiasing already generated this source, retaining its MSAA/SMAA and
# premultiplied-alpha changes. Extend that same adapted source.
eyes_replace_scheduling(rive_rhi_source
    "    if (m_renderer) {\n        m_renderer->updateViewPort(m_rect);"
    "    const bool eyesRedraw = m_eyesDirty || m_verticesDirty;\n    if (eyesRedraw && m_renderer) {\n        m_renderer->updateViewPort(m_rect);")
eyes_replace_scheduling(rive_rhi_source
    "    m_renderer->recycleRiveNodes();"
    "    if (eyesRedraw) m_renderer->recycleRiveNodes();")
eyes_replace_scheduling(rive_rhi_source
    "    artboardInstance->draw(m_renderer);"
    "    if (eyesRedraw) artboardInstance->draw(m_renderer);")
eyes_replace_scheduling(rive_rhi_source
    "    QMatrix4x4 mvp = *projectionMatrix();"
    "    if (eyesRedraw) {\n        m_currentRenderSurface = &m_renderSurfaceA;\n        commandBuffer->beginPass(m_cleanUpTextureTarget, QColor(0, 0, 0, 0), { 1.0f, 0 });\n        commandBuffer->endPass();\n        m_renderer->render(commandBuffer);\n        m_eyesDirty = false;\n    }\n\n    QMatrix4x4 mvp = *projectionMatrix();")
eyes_replace_scheduling(rive_rhi_source
    "    if (m_postprocessing) {\n        m_postprocessing->postprocess(rhi, commandBuffer, isCurrentRenderBufferA());"
    "    if (eyesRedraw && m_postprocessing) {\n        m_postprocessing->postprocess(rhi, commandBuffer, isCurrentRenderBufferA());")
file(CONFIGURE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/riveqsgrhirendernode.cpp
    CONTENT "${rive_rhi_source}" @ONLY)
