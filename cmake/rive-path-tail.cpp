// SPDX-FileCopyrightText: 2023 basysKom GmbH
// SPDX-License-Identifier: LGPL-3.0-or-later
// Eyes modification: normalize small local paths before Qt's fixed precision
// triangulation, then restore their coordinates. Eye paths use unit space and
// are enlarged by their parent rig; flattening in unit space loses eyelid detail.
void RiveQtPath::updatePathSegmentsData()
{
    m_pathVertices.clear();
    if (m_path.isEmpty()) {
        m_pathSegmentDataDirty = false;
        return;
    }
    const QRectF bounds = m_path.boundingRect();
    const qreal extent = qMax(qreal(0.0001), qMax(bounds.width(), bounds.height()));
    const qreal precisionScale = qMax(qreal(1), qreal(4096) / extent);
    QTriangleSet triangles = qTriangulate(m_path,
        QTransform::fromScale(precisionScale, precisionScale), m_renderQuality);
    QVector<QVector2D> pathData;
    pathData.reserve(triangles.indices.size());
    for (int i = 0; i < triangles.indices.size(); i++) {
        const int index = triangles.indices.type() == QVertexIndexVector::UnsignedInt
            ? static_cast<const quint32 *>(triangles.indices.data())[i]
            : static_cast<const quint16 *>(triangles.indices.data())[i];
        pathData.append(QVector2D(triangles.vertices[2 * index] / precisionScale,
            triangles.vertices[2 * index + 1] / precisionScale));
    }
    m_pathVertices.append(pathData);
    m_pathSegmentDataDirty = false;
}
