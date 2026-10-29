pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Window
import "EyesRive" as Rive
import "eyes-core.js" as EyeCore

Item {
    id: scene
    required property var simulation
    property var frame: null
    readonly property var pose: frame ? frame.pose : EyeCore.EyesCore.getPose("idle")
    readonly property var layout: EyeCore.EyesCore.getLayout(width, height, true)
    readonly property real renderPixelRatio: Math.max(1, Screen.devicePixelRatio)
    readonly property var faceMatrix: EyeCore.EyesCore.getFaceScreenMatrix(
        frame && frame.face ? frame.face : ({matrix: EyeCore.EyesCore.getFaceMatrix(0, 0, 0)}), layout)
    readonly property var inputs: frame ? frame.riveInputs : ({idlestill: 100})
    readonly property alias renderer: riveItem
    readonly property bool loaded: riveItem.loadingStatus === Rive.RiveQtQuickItem.Loaded

    onFrameChanged: {
        const values = frame ? frame.riveInputs : {idlestill: 100};
        riveItem.stateMachineInterface.updateInputs(values);
        riveItem.update();
    }

    function advance(delta) {
        frame = simulation.update(Math.min(delta, 0.064));
    }

    Item {
        x: scene.layout.centerX + scene.pose.gazeX * scene.layout.scale
        y: scene.layout.centerY + scene.pose.gazeY * scene.layout.gazeScaleY *
            scene.layout.scale * scene.layout.stretchY
        transform: Matrix4x4 {
            readonly property var m: scene.faceMatrix
            matrix: Qt.matrix4x4(m[0], m[1], m[2], m[3],
                m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11],
                m[12], m[13], m[14], m[15])
        }

        Rive.RiveQtQuickItem {
            id: riveItem
            objectName: "rive-eyes"
            // Allocate the vector render target at the actual output size.
            // Scaling a fixed 560x340 texture would soften large displays.
            width: 560 * scene.layout.scale * scene.renderPixelRatio
            height: 340 * scene.layout.scale * scene.layout.stretchY * scene.renderPixelRatio
            x: -width / 2
            y: -height / 2
            enabled: false
            interactive: false
            fillMode: Rive.RenderSettings.Stretch
            renderQuality: Rive.RenderSettings.High
            // Tessellation quality does not antialias pixels. Plasma commonly
            // has a single-sample swapchain, so explicitly smooth edge coverage.
            postprocessingMode: Rive.RenderSettings.SMAA
            fileSource: Window.window ? decodeURIComponent(
                Qt.resolvedUrl("eyes.riv").toString().replace(/^file:\/\//, "")) : ""
            currentArtboardIndex: 0
            currentStateMachineIndex: 0
            transform: Scale {
                origin.x: riveItem.width / 2
                origin.y: riveItem.height / 2
                xScale: (1 + (scene.frame ? scene.frame.bounce : 0)) / scene.renderPixelRatio
                yScale: (1 - (scene.frame ? scene.frame.bounce : 0)) / scene.renderPixelRatio
            }
            stateMachineInterface: Rive.RiveStateMachineInput {}
        }
    }
}
