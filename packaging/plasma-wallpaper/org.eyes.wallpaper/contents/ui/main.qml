import QtQuick
import QtQuick.Effects
import QtWebSockets
import org.kde.plasma.plasmoid
import "eyes-core.js" as EyeCore

WallpaperItem {
    id: root

    readonly property string bridgeUrl: "ws://127.0.0.1:38271/"
    property bool shown: false
    property real reveal: shown ? 1 : 0
    property var hostState: ({
        "eyebrow": "Eyes 在线",
        "title": "随时准备出发",
        "detail": "收到任务后，我会在这里工作",
        "motion": "idle"
    })
    property var simulation: EyeCore.EyesCore.createSimulation({
        "immersive": true,
        "reducedMotion": false
    })
    readonly property string wallpaperSource: String(
        root.configuration.Image || ""
    )
    property var frameSamples: []
    property real performanceSince: 0

    Component.onCompleted: console.info("Eyes GPU wallpaper loaded", Screen.name)

    Behavior on reveal {
        NumberAnimation {
            duration: 760
            easing.type: Easing.OutCubic
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "#d8d2df"
    }

    Image {
        id: wallpaperImage
        anchors.fill: parent
        source: root.wallpaperSource
        fillMode: Image.PreserveAspectCrop
        cache: true
        asynchronous: true
    }

    Item {
        id: material
        anchors.fill: parent
        opacity: root.reveal

        Item {
            id: frostSource
            anchors.fill: parent
            MultiEffect {
                anchors.fill: parent
                source: wallpaperImage
                autoPaddingEnabled: false
                blurEnabled: true
                blur: 1.0
                blurMax: 64
                blurMultiplier: 1.0
            }
        }

        ShaderEffectSource {
            id: frostCache
            anchors.fill: parent
            sourceItem: frostSource
            hideSource: true
            live: false
            onWidthChanged: scheduleUpdate()
            onHeightChanged: scheduleUpdate()
        }
    }

    Connections {
        target: wallpaperImage
        function onStatusChanged() {
            if (wallpaperImage.status === Image.Ready) frostCache.scheduleUpdate();
        }
    }

    RiveEyeScene {
        id: eyeScene
        anchors.fill: parent
        visible: root.reveal > 0.001
        opacity: root.reveal
        simulation: root.simulation

        onWidthChanged: root.resizeEngine()
        onHeightChanged: root.resizeEngine()
        Component.onCompleted: root.resizeEngine()
        onLoadedChanged: if (loaded) console.info("Eyes Rive wallpaper loaded", Screen.name,
            "dpr=" + renderPixelRatio)
    }

    Item {
        id: presenceCopy
        anchors.fill: parent
        opacity: root.reveal

        Column {
            anchors.horizontalCenter: parent.horizontalCenter
            y: EyeCore.EyesCore.getLayout(
                root.width,
                root.height,
                true
            ).captionY
            width: Math.min(root.width * 0.72, 760)
            spacing: Math.max(5, root.height * 0.007)

            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: Math.max(7, root.width * 0.006)

                Rectangle {
                    width: Math.max(5, root.width * 0.0035)
                    height: width
                    radius: width / 2
                    anchors.verticalCenter: parent.verticalCenter
                    color: "#8952cf"
                    opacity: 0.72
                }

                Text {
                    text: String(root.hostState.eyebrow || "Eyes")
                    color: Qt.rgba(0.31, 0.23, 0.41, 0.57)
                    font.family: "sans-serif"
                    font.pixelSize: Math.max(10, Math.min(16, root.width * 0.006))
                    font.weight: Font.DemiBold
                    font.letterSpacing: Math.max(1.5, root.width * 0.0015)
                }
            }

            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: String(root.hostState.title || "")
                color: "#4f3c67"
                font.family: "sans-serif"
                font.pixelSize: Math.max(18, Math.min(34, root.width * 0.013))
                font.weight: Font.Medium
            }

            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: String(root.hostState.detail || "")
                color: Qt.rgba(0.31, 0.25, 0.39, 0.55)
                font.family: "sans-serif"
                font.pixelSize: Math.max(11, Math.min(16, root.width * 0.0065))
            }
        }

        Text {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.leftMargin: root.width * 0.042
            anchors.topMargin: root.height * 0.042
            text: "AGENT PRESENCE"
            color: Qt.rgba(0.27, 0.20, 0.35, 0.31)
            font.pixelSize: Math.max(8, Math.min(12, root.width * 0.0048))
            font.letterSpacing: Math.max(1.2, root.width * 0.0012)
        }

        Text {
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.rightMargin: root.width * 0.042
            anchors.topMargin: root.height * 0.042
            text: "Eyes"
            color: Qt.rgba(0.27, 0.20, 0.35, 0.31)
            font.pixelSize: Math.max(8, Math.min(12, root.width * 0.0048))
            font.letterSpacing: Math.max(1.2, root.width * 0.0012)
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            anchors.bottomMargin: root.height * 0.042
            text: "DESKTOP HARNESS · LIVE"
            color: Qt.rgba(0.27, 0.20, 0.35, 0.27)
            font.pixelSize: Math.max(7, Math.min(10, root.width * 0.004))
            font.letterSpacing: Math.max(1.1, root.width * 0.001)
        }
    }

    FrameAnimation {
        id: animationTimer
        running: root.reveal > 0.001
        onTriggered: {
            eyeScene.advance(frameTime > 0 ? frameTime : 1 / 60);
            if (root.configuration.DebugPerformance) root.recordFrame(frameTime);
        }
    }

    function recordFrame(delta) {
        var now = Date.now();
        if (performanceSince === 0) performanceSince = now;
        frameSamples.push(delta * 1000);
        if (now - performanceSince < 5000) return;
        var samples = frameSamples.slice().sort(function(a, b) { return a - b; });
        console.info("EYES_PERF GPU screen=" + Screen.name +
            " fps=" + (1000 * samples.length / (now - performanceSince)).toFixed(1) +
            " p95_ms=" + samples[Math.floor(samples.length * 0.95)].toFixed(1));
        frameSamples = [];
        performanceSince = now;
    }

    WebSocket {
        id: bridgeSocket
        active: true
        url: root.bridgeUrl + "?screen=" + encodeURIComponent(Screen.name || "")

        onStatusChanged: function (status) {
            if (status === WebSocket.Open) {
                reconnectTimer.stop();
                return;
            }
            root.shown = false;
            reconnectTimer.start();
        }

        onTextMessageReceived: function(message) {
            try {
                root.handleMessage(JSON.parse(message));
            } catch (error) {
                console.warn("Eyes bridge ignored a malformed message:", error);
            }
        }
    }

    Timer {
        id: reconnectTimer
        interval: 1200
        repeat: false
        onTriggered: {
            bridgeSocket.active = false;
            bridgeSocket.url = root.bridgeUrl + "?screen=" + encodeURIComponent(Screen.name || "");
            bridgeSocket.active = true;
        }
    }

    function resizeEngine() {
        root.simulation.resize(root.width, root.height, 1, true);
    }

    function handleMessage(message) {
        if (!message || typeof message !== "object") return;

        if (message.type === "snapshot") {
            root.applyState(message.state || {});
            root.shown = Boolean(message.visible);
            if (message.attention) {
                root.applyAttention(message.attention);
            }
            return;
        }

        if (message.type === "state") {
            root.applyState(message.state || {});
            return;
        }

        if (message.type === "visible") {
            root.shown = Boolean(message.visible);
            return;
        }

        if (message.type === "attention") {
            root.applyAttention(message.attention || {});
            return;
        }

        if (message.type === "action") {
            if (message.action === "blink") {
                root.simulation.blink(Boolean(message.double));
            } else if (message.action === "look") {
                root.simulation.look(
                    Number(message.x),
                    Number(message.y),
                    Number(message.duration)
                );
            }
        }
    }

    function applyState(state) {
        root.hostState = state;
        if (typeof state.motion === "string") {
            root.simulation.setEmotion(state.motion);
        }
    }

    function applyAttention(attention) {
        var width = Math.max(1, root.width);
        var height = Math.max(1, root.height);
        var clientX = Number(attention.x);
        var clientY = Number(attention.y);
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
        var gaze = EyeCore.EyesCore.getPointerGaze(
            clientX,
            clientY,
            {"left": 0, "top": 0, "width": width, "height": height},
            true
        );
        root.simulation.setPointer(gaze.x, gaze.y, Boolean(attention.active));
    }
}
