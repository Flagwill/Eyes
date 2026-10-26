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
    readonly property var inputs: frame ? frame.riveInputs : ({idlestill: 100})
    readonly property alias renderer: riveItem
    readonly property bool loaded: riveItem.loadingStatus === Rive.RiveQtQuickItem.Loaded

    function advance(delta) {
        frame = simulation.update(Math.min(delta, 0.064));
    }

    Item {
        x: scene.layout.centerX + scene.pose.gazeX * scene.layout.scale
        y: scene.layout.centerY + scene.pose.gazeY * scene.layout.gazeScaleY *
            scene.layout.scale * scene.layout.stretchY
        rotation: scene.pose.tilt * 180 / Math.PI

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
            stateMachineInterface: Rive.RiveStateMachineInput {
                property real idlestill: scene.inputs.idlestill || 0
                property real idleact: scene.inputs.idleact || 0
                property real idleentry: scene.inputs.idleentry || 0
                property real idlefollow: scene.inputs.idlefollow || 0
                property real idleresolve: scene.inputs.idleresolve || 0
                property real happystill: scene.inputs.happystill || 0
                property real happyact: scene.inputs.happyact || 0
                property real happyentry: scene.inputs.happyentry || 0
                property real happyfollow: scene.inputs.happyfollow || 0
                property real happyresolve: scene.inputs.happyresolve || 0
                property real curiousstill: scene.inputs.curiousstill || 0
                property real curiousact: scene.inputs.curiousact || 0
                property real curiousentry: scene.inputs.curiousentry || 0
                property real curiousfollow: scene.inputs.curiousfollow || 0
                property real curiousresolve: scene.inputs.curiousresolve || 0
                property real thinkingstill: scene.inputs.thinkingstill || 0
                property real thinkingact: scene.inputs.thinkingact || 0
                property real thinkingentry: scene.inputs.thinkingentry || 0
                property real thinkingfollow: scene.inputs.thinkingfollow || 0
                property real thinkingresolve: scene.inputs.thinkingresolve || 0
                property real focusedstill: scene.inputs.focusedstill || 0
                property real focusedact: scene.inputs.focusedact || 0
                property real focusedentry: scene.inputs.focusedentry || 0
                property real focusedfollow: scene.inputs.focusedfollow || 0
                property real focusedresolve: scene.inputs.focusedresolve || 0
                property real surprisedstill: scene.inputs.surprisedstill || 0
                property real surprisedact: scene.inputs.surprisedact || 0
                property real surprisedentry: scene.inputs.surprisedentry || 0
                property real surprisedfollow: scene.inputs.surprisedfollow || 0
                property real surprisedresolve: scene.inputs.surprisedresolve || 0
                property real sleepystill: scene.inputs.sleepystill || 0
                property real sleepyact: scene.inputs.sleepyact || 0
                property real sleepyentry: scene.inputs.sleepyentry || 0
                property real sleepyfollow: scene.inputs.sleepyfollow || 0
                property real sleepyresolve: scene.inputs.sleepyresolve || 0
                property real confusedstill: scene.inputs.confusedstill || 0
                property real confusedact: scene.inputs.confusedact || 0
                property real confusedentry: scene.inputs.confusedentry || 0
                property real confusedfollow: scene.inputs.confusedfollow || 0
                property real confusedresolve: scene.inputs.confusedresolve || 0
                property real flow: scene.inputs.flow || 0
                property real accents: scene.inputs.accents === undefined ? 100 : scene.inputs.accents
                property real flowphase: scene.inputs.flowphase || 0
                property real blink: scene.inputs.blink || 0
                property real lookx: scene.inputs.lookx || 0
                property real looky: scene.inputs.looky || 0
                property real lightx: scene.inputs.lightx || 0
                property real lighty: scene.inputs.lighty || 0
            }
        }
    }
}
