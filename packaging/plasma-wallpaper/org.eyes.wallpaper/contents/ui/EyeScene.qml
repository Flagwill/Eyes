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
        if (simulation.accents && (pose.thinking + pose.happy + pose.curious + pose.focused + pose.surprised +
                pose.sleepy + pose.confused > 0.001 || accents.hadAccents)) {
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
                    readonly property real breathe: scene.frame ? scene.frame.breathe : 0
                    readonly property var geometry: EyeCore.EyesCore.getEyeGeometry(
                        scene.pose, modelData, scene.blink, breathe)
                    readonly property real eyeWidth: geometry.width
                    readonly property real eyeHeight: geometry.height
                    readonly property var light: EyeCore.EyesCore.getLight(
                        scene.pose, scene.simulation.lightTime, modelData)
                    readonly property var fragments: EyeCore.EyesCore.getLightFragments(
                        scene.pose, scene.simulation.flowTime, modelData)
                    function vector(c) { return Qt.vector4d(c[0], c[1], c[2], c[3]); }
                    readonly property real padding: 40
                    x: scene.pose[modelData + "x"]
                    y: scene.pose[modelData + "y"] + geometry.offsetY
                    rotation: scene.pose[modelData + "r"] * 180 / Math.PI

                    ShaderEffect {
                        objectName: "eyeSurface-" + eye.modelData
                        x: -eye.eyeWidth / 2 - eye.padding
                        y: -eye.geometry.extent - eye.padding
                        width: eye.eyeWidth + eye.padding * 2
                        height: eye.geometry.extent * 2 + eye.padding * 2
                        property size surfaceSize: Qt.size(width, height)
                        property point surfaceOrigin: Qt.point(x, y)
                        property vector4d eyeGeometry: Qt.vector4d(
                            eye.eyeWidth, eye.eyeHeight, eye.geometry.extent, scene.pose.glow)
                        property vector4d upper0: eye.vector(eye.geometry.upper[0])
                        property vector4d upper1: eye.vector(eye.geometry.upper[1])
                        property vector4d upper2: eye.vector(eye.geometry.upper[2])
                        property vector4d upper3: eye.vector(eye.geometry.upper[3])
                        property vector4d lower0: eye.vector(eye.geometry.lower[0])
                        property vector4d lower1: eye.vector(eye.geometry.lower[1])
                        property vector4d lower2: eye.vector(eye.geometry.lower[2])
                        property vector4d lower3: eye.vector(eye.geometry.lower[3])
                        property vector4d lightGeometry: Qt.vector4d(
                            eye.light.x, eye.light.y, eye.light.spread, eye.light.height)
                        property vector4d lightDetail: Qt.vector4d(
                            eye.light.kind, 0, eye.light.strength * (1 - scene.blink * 0.85), 0)
                        property vector4d fragmentGeometryA: Qt.vector4d(
                            eye.fragments[0].x, eye.fragments[0].y,
                            eye.fragments[0].spread, eye.fragments[0].height)
                        property vector4d fragmentDetailA: Qt.vector4d(
                            1, 0, eye.fragments[0].strength * (1 - scene.blink * 0.85), 0)
                        property vector4d fragmentGeometryB: Qt.vector4d(
                            eye.fragments[1].x, eye.fragments[1].y,
                            eye.fragments[1].spread, eye.fragments[1].height)
                        property vector4d fragmentDetailB: Qt.vector4d(
                            1, 0, eye.fragments[1].strength * (1 - scene.blink * 0.85), 0)
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
                visible: Boolean(scene.simulation.accents)
                property bool hadAccents: false
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.clearRect(0, 0, width, height);
                    ctx.translate(280, 180);
                    EyeCore.EyesCore.drawAccents(ctx, scene.pose);
                    hadAccents = scene.pose.thinking + scene.pose.happy + scene.pose.curious + scene.pose.focused +
                        scene.pose.surprised + scene.pose.sleepy + scene.pose.confused > 0.001;
                }
            }
        }
    }
}
