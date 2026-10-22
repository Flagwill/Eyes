pragma ComponentBehavior: Bound
import QtQuick
import "eyes-core.js" as EyeCore

Item {
    id: scene

    required property var simulation
    property var frame: null
    readonly property var pose: frame ? frame.pose : EyeCore.EyesCore.getPose("idle")
    readonly property real blink: frame ? frame.blink : 0
    readonly property var layout: EyeCore.EyesCore.getLayout(width, height, true)
    readonly property real modelScale: layout.scale

    function advance(delta) {
        frame = simulation.update(Math.min(delta, 0.064));
        // Only the small decorative marks use a raster texture, never the eyes.
        if (pose.thinking + pose.happy + pose.curious + pose.surprised +
                pose.sleepy + pose.confused > 0.001 || accents.hadAccents) {
            accents.requestPaint();
        }
    }

    Item {
        x: scene.layout.centerX
        y: scene.layout.centerY
        transform: Scale {
            xScale: scene.modelScale
            yScale: scene.modelScale * scene.layout.stretchY
        }

        Item {
            x: scene.pose.gazeX
            y: scene.pose.gazeY * scene.layout.gazeScaleY
            rotation: scene.pose.tilt * 180 / Math.PI
            transform: Scale {
                xScale: 1 + (scene.frame ? scene.frame.bounce : 0)
                yScale: 1 - (scene.frame ? scene.frame.bounce : 0)
            }

            Repeater {
                model: ["l", "r"]
                delegate: Item {
                    id: eye
                    required property string modelData
                    readonly property real breathe: scene.frame && scene.frame.alive
                        ? Math.sin(scene.simulation.elapsed * 1.4) * 0.006 * scene.simulation.energy : 0
                    readonly property var geometry: EyeCore.EyesCore.getEyeGeometry(
                        scene.pose, modelData, scene.blink, breathe)
                    readonly property real eyeWidth: geometry.width
                    readonly property real eyeHeight: geometry.height
                    readonly property real bend: geometry.bend
                    readonly property var light: EyeCore.EyesCore.getLight(
                        scene.pose, scene.simulation.lightTime, modelData)
                    readonly property var lightShape: EyeCore.EyesCore.getLightGeometry(
                        light, eyeWidth, eyeHeight, bend)
                    readonly property var fragments: EyeCore.EyesCore.getLightFragments(
                        scene.pose, scene.simulation.flowTime, modelData)
                    readonly property var fragmentA: EyeCore.EyesCore.getLightGeometry(
                        fragments[0], eyeWidth, eyeHeight, bend)
                    readonly property var fragmentB: EyeCore.EyesCore.getLightGeometry(
                        fragments[1], eyeWidth, eyeHeight, bend)
                    readonly property real padding: 40
                    x: scene.pose[modelData + "x"]
                    y: scene.pose[modelData + "y"]
                    rotation: scene.pose[modelData + "r"] * 180 / Math.PI

                    ShaderEffect {
                        objectName: "eyeSurface-" + eye.modelData
                        x: -eye.eyeWidth / 2 - eye.padding
                        y: -eye.eyeHeight / 2 - eye.bend - eye.padding
                        width: eye.eyeWidth + eye.padding * 2
                        height: eye.eyeHeight + eye.bend + eye.padding * 2
                        property size surfaceSize: Qt.size(width, height)
                        property point surfaceOrigin: Qt.point(x, y)
                        property vector4d eyeGeometry: Qt.vector4d(
                            eye.eyeWidth, eye.eyeHeight, eye.bend, scene.pose.glow)
                        property vector4d lightGeometry: Qt.vector4d(
                            eye.lightShape.x, eye.lightShape.y,
                            eye.lightShape.width, eye.lightShape.height)
                        property vector4d lightDetail: Qt.vector4d(
                            eye.lightShape.bend, eye.lightShape.slope,
                            eye.light.strength * (1 - scene.blink * 0.85), 0)
                        property vector4d fragmentGeometryA: Qt.vector4d(
                            eye.fragmentA.x, eye.fragmentA.y, eye.fragmentA.width, eye.fragmentA.height)
                        property vector4d fragmentDetailA: Qt.vector4d(
                            eye.fragmentA.bend, eye.fragmentA.slope,
                            eye.fragments[0].strength * (1 - scene.blink * 0.85), 0)
                        property vector4d fragmentGeometryB: Qt.vector4d(
                            eye.fragmentB.x, eye.fragmentB.y, eye.fragmentB.width, eye.fragmentB.height)
                        property vector4d fragmentDetailB: Qt.vector4d(
                            eye.fragmentB.bend, eye.fragmentB.slope,
                            eye.fragments[1].strength * (1 - scene.blink * 0.85), 0)
                        fragmentShader: "eye.frag.qsb"
                    }
                }
            }

            Canvas {
                id: accents
                x: -280
                y: -180
                width: 560
                height: 340
                antialiasing: true
                property bool hadAccents: false
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.clearRect(0, 0, width, height);
                    ctx.translate(280, 180);
                    EyeCore.EyesCore.drawAccents(ctx, scene.pose,
                        scene.frame && scene.frame.alive ? scene.simulation.elapsed : 0);
                    hadAccents = scene.pose.thinking + scene.pose.happy + scene.pose.curious +
                        scene.pose.surprised + scene.pose.sleepy + scene.pose.confused > 0.001;
                }
            }
        }
    }
}
