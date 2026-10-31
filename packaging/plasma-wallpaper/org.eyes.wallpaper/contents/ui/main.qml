import QtQuick
import QtQuick.Effects
import QtWebSockets
import org.kde.plasma.plasmoid
import org.kde.plasma.wallpapers.image as Wallpaper
import "eyes-core.js" as EyeCore

WallpaperItem {
    id: root

    readonly property string bridgeUrl: "ws://127.0.0.1:38271/"
    property bool shown: false
    property real reveal: shown ? 1 : 0
    property var simulation: EyeCore.EyesCore.createSimulation({
        "immersive": true,
        "reducedMotion": false
    })
    readonly property string wallpaperSource: String(
        root.configuration.Image || ""
    )
    readonly property var wallpaperSnapshot: wallpaperResolver.snapshot
    readonly property url wallpaperBottomSource: String(
        wallpaperSnapshot ? wallpaperSnapshot.bottom : ""
    )
    readonly property url wallpaperTopSource: String(
        wallpaperSnapshot ? wallpaperSnapshot.top : ""
    )
    readonly property real wallpaperBlendFactor: {
        var value = wallpaperSnapshot ? Number(wallpaperSnapshot.blendFactor) : 0;
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    }
    onWallpaperBlendFactorChanged: Qt.callLater(frostCache.scheduleUpdate)
    readonly property color wallpaperColor: String(
        root.configuration.Color || "#d8d2df"
    )
    readonly property int wallpaperFillMode: {
        var mode = Number(root.configuration.FillMode);
        if (mode === 0) return Image.Stretch;
        if (mode === 1) return Image.PreserveAspectFit;
        if (mode === 3) return Image.Tile;
        if (mode === 4) return Image.TileVertically;
        if (mode === 5) return Image.TileHorizontally;
        if (mode === 6) return Image.Pad;
        return Image.PreserveAspectCrop;
    }
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
        color: root.wallpaperColor
    }

    Wallpaper.DayNightWallpaper {
        id: wallpaperResolver
        source: root.wallpaperSource
    }

    Item {
        id: wallpaperSurface
        anchors.fill: parent

        Wallpaper.TransientImage {
            id: wallpaperBottomImage
            anchors.fill: parent
            source: root.wallpaperBottomSource
            fillMode: root.wallpaperFillMode
        }

        Wallpaper.TransientImage {
            id: wallpaperTopImage
            anchors.fill: parent
            source: root.wallpaperTopSource
            fillMode: root.wallpaperFillMode
            visible: root.wallpaperBlendFactor > 0
            opacity: root.wallpaperBlendFactor
        }
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
                source: wallpaperSurface
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
        target: wallpaperBottomImage
        function onStatusChanged() {
            if (wallpaperBottomImage.status === Wallpaper.TransientImage.Ready)
                frostCache.scheduleUpdate();
        }
    }

    Connections {
        target: wallpaperTopImage
        function onStatusChanged() {
            if (wallpaperTopImage.status === Wallpaper.TransientImage.Ready)
                frostCache.scheduleUpdate();
        }
    }

    Connections {
        target: wallpaperResolver
        function onSnapshotChanged() {
            Qt.callLater(frostCache.scheduleUpdate);
        }
    }

    Loader {
        id: eyeScene
        anchors.fill: parent
        active: root.reveal > 0.001
        opacity: root.reveal
        sourceComponent: RiveEyeScene {
            simulation: root.simulation
            Component.onCompleted: {
                root.resizeEngine();
                advance(0);
            }
            onLoadedChanged: if (loaded) console.info("Eyes Rive wallpaper loaded", Screen.name,
                "dpr=" + renderPixelRatio)
        }
        onWidthChanged: root.resizeEngine()
        onHeightChanged: root.resizeEngine()
    }

    AnimationClock {
        id: animationTimer
        running: root.reveal > 0.001
        framesPerSecond: Number(root.configuration.AnimationFps) || 60
        onAdvance: function(delta) {
            if (eyeScene.item) eyeScene.item.advance(delta);
            if (root.configuration.DebugPerformance) root.recordFrame(delta);
        }
    }

    Connections {
        target: animationTimer
        function onRunningChanged() {
            root.frameSamples = [];
            root.performanceSince = 0;
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
        // Let the URL settle before activating. Activating declaratively can
        // race the URL initializer in a long-lived Plasma QML engine and leave
        // the client permanently disconnected while the wallpaper itself loads.
        active: false
        url: root.bridgeUrl + "?screen=" + encodeURIComponent(Screen.name || "")

        Component.onCompleted: root.connectBridge()

        onStatusChanged: function (status) {
            if (status === WebSocket.Open) {
                reconnectTimer.stop();
                bridgeSocket.sendTextMessage("snapshot");
                return;
            }
            if (status === WebSocket.Error || status === WebSocket.Closed) {
                root.shown = false;
                reconnectTimer.start();
            }
        }

        onErrorStringChanged: {
            if (status === WebSocket.Error && errorString)
                console.warn("Eyes bridge unavailable:", errorString);
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
            root.connectBridge();
        }
    }

    function connectBridge() {
        bridgeSocket.active = false;
        bridgeSocket.url = root.bridgeUrl + "?screen="
            + encodeURIComponent(Screen.name || "");
        bridgeSocket.active = true;
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
