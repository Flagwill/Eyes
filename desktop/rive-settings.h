#pragma once

#include <QtQml/qqmlregistration.h>
#include "datatypes.h"

// The upstream gadget has no QML registration. Export its enum metadata so
// Qt 6 can type-check the renderer's public enum properties.
namespace EyesRiveRenderSettings {
    Q_NAMESPACE
    QML_FOREIGN_NAMESPACE(RiveRenderSettings)
    QML_NAMED_ELEMENT(RenderSettings)
}
