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

    onFrameChanged: riveItem.update()

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
                property real listeningstill: scene.inputs.listeningstill || 0
                property real listeningact: scene.inputs.listeningact || 0
                property real listeningentry: scene.inputs.listeningentry || 0
                property real listeningfollow: scene.inputs.listeningfollow || 0
                property real listeningresolve: scene.inputs.listeningresolve || 0
                property real planningstill: scene.inputs.planningstill || 0
                property real planningact: scene.inputs.planningact || 0
                property real planningentry: scene.inputs.planningentry || 0
                property real planningfollow: scene.inputs.planningfollow || 0
                property real planningresolve: scene.inputs.planningresolve || 0
                property real readingstill: scene.inputs.readingstill || 0
                property real readingact: scene.inputs.readingact || 0
                property real readingentry: scene.inputs.readingentry || 0
                property real readingfollow: scene.inputs.readingfollow || 0
                property real readingresolve: scene.inputs.readingresolve || 0
                property real searchingstill: scene.inputs.searchingstill || 0
                property real searchingact: scene.inputs.searchingact || 0
                property real searchingentry: scene.inputs.searchingentry || 0
                property real searchingfollow: scene.inputs.searchingfollow || 0
                property real searchingresolve: scene.inputs.searchingresolve || 0
                property real creatingstill: scene.inputs.creatingstill || 0
                property real creatingact: scene.inputs.creatingact || 0
                property real creatingentry: scene.inputs.creatingentry || 0
                property real creatingfollow: scene.inputs.creatingfollow || 0
                property real creatingresolve: scene.inputs.creatingresolve || 0
                property real editingstill: scene.inputs.editingstill || 0
                property real editingact: scene.inputs.editingact || 0
                property real editingentry: scene.inputs.editingentry || 0
                property real editingfollow: scene.inputs.editingfollow || 0
                property real editingresolve: scene.inputs.editingresolve || 0
                property real runningstill: scene.inputs.runningstill || 0
                property real runningact: scene.inputs.runningact || 0
                property real runningentry: scene.inputs.runningentry || 0
                property real runningfollow: scene.inputs.runningfollow || 0
                property real runningresolve: scene.inputs.runningresolve || 0
                property real mcpstill: scene.inputs.mcpstill || 0
                property real mcpact: scene.inputs.mcpact || 0
                property real mcpentry: scene.inputs.mcpentry || 0
                property real mcpfollow: scene.inputs.mcpfollow || 0
                property real mcpresolve: scene.inputs.mcpresolve || 0
                property real toolstill: scene.inputs.toolstill || 0
                property real toolact: scene.inputs.toolact || 0
                property real toolentry: scene.inputs.toolentry || 0
                property real toolfollow: scene.inputs.toolfollow || 0
                property real toolresolve: scene.inputs.toolresolve || 0
                property real skillstill: scene.inputs.skillstill || 0
                property real skillact: scene.inputs.skillact || 0
                property real skillentry: scene.inputs.skillentry || 0
                property real skillfollow: scene.inputs.skillfollow || 0
                property real skillresolve: scene.inputs.skillresolve || 0
                property real testingstill: scene.inputs.testingstill || 0
                property real testingact: scene.inputs.testingact || 0
                property real testingentry: scene.inputs.testingentry || 0
                property real testingfollow: scene.inputs.testingfollow || 0
                property real testingresolve: scene.inputs.testingresolve || 0
                property real debuggingstill: scene.inputs.debuggingstill || 0
                property real debuggingact: scene.inputs.debuggingact || 0
                property real debuggingentry: scene.inputs.debuggingentry || 0
                property real debuggingfollow: scene.inputs.debuggingfollow || 0
                property real debuggingresolve: scene.inputs.debuggingresolve || 0
                property real reviewingstill: scene.inputs.reviewingstill || 0
                property real reviewingact: scene.inputs.reviewingact || 0
                property real reviewingentry: scene.inputs.reviewingentry || 0
                property real reviewingfollow: scene.inputs.reviewingfollow || 0
                property real reviewingresolve: scene.inputs.reviewingresolve || 0
                property real savingstill: scene.inputs.savingstill || 0
                property real savingact: scene.inputs.savingact || 0
                property real savingentry: scene.inputs.savingentry || 0
                property real savingfollow: scene.inputs.savingfollow || 0
                property real savingresolve: scene.inputs.savingresolve || 0
                property real delegatingstill: scene.inputs.delegatingstill || 0
                property real delegatingact: scene.inputs.delegatingact || 0
                property real delegatingentry: scene.inputs.delegatingentry || 0
                property real delegatingfollow: scene.inputs.delegatingfollow || 0
                property real delegatingresolve: scene.inputs.delegatingresolve || 0
                property real waitingstill: scene.inputs.waitingstill || 0
                property real waitingact: scene.inputs.waitingact || 0
                property real waitingentry: scene.inputs.waitingentry || 0
                property real waitingfollow: scene.inputs.waitingfollow || 0
                property real waitingresolve: scene.inputs.waitingresolve || 0
                property real blockedstill: scene.inputs.blockedstill || 0
                property real blockedact: scene.inputs.blockedact || 0
                property real blockedentry: scene.inputs.blockedentry || 0
                property real blockedfollow: scene.inputs.blockedfollow || 0
                property real blockedresolve: scene.inputs.blockedresolve || 0
                property real retryingstill: scene.inputs.retryingstill || 0
                property real retryingact: scene.inputs.retryingact || 0
                property real retryingentry: scene.inputs.retryingentry || 0
                property real retryingfollow: scene.inputs.retryingfollow || 0
                property real retryingresolve: scene.inputs.retryingresolve || 0
                property real summarizingstill: scene.inputs.summarizingstill || 0
                property real summarizingact: scene.inputs.summarizingact || 0
                property real summarizingentry: scene.inputs.summarizingentry || 0
                property real summarizingfollow: scene.inputs.summarizingfollow || 0
                property real summarizingresolve: scene.inputs.summarizingresolve || 0
                property real completestill: scene.inputs.completestill || 0
                property real completeact: scene.inputs.completeact || 0
                property real completeentry: scene.inputs.completeentry || 0
                property real completefollow: scene.inputs.completefollow || 0
                property real completeresolve: scene.inputs.completeresolve || 0
                property real flow: scene.inputs.flow || 0
                property real accents: scene.inputs.accents === undefined ? 100 : scene.inputs.accents
                property real flowphase: scene.inputs.flowphase || 0
                property real blink: scene.inputs.blink || 0
                property real lookx: scene.inputs.lookx || 0
                property real looky: scene.inputs.looky || 0
                property real lightx: scene.inputs.lightx || 0
                property real lighty: scene.inputs.lighty || 0
                property real propbase: scene.inputs.propbase || 100
                property real propleft: scene.inputs.propleft || 0
                property real propright: scene.inputs.propright || 0
                property real propup: scene.inputs.propup || 0
                property real propdown: scene.inputs.propdown || 0
            }
        }
    }
}
