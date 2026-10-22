import QtQuick
import QtWebEngine

Item {
    id: root

    property var controller: null
    property string screenName: ""
    property bool pageReady: false

    function evaluate(source) {
        if (!root.pageReady || !source)
            return;
        webView.runJavaScript(source);
    }

    function syncAll() {
        if (!controller)
            return;
        root.evaluate("window.mioHost && window.mioHost.state(" + JSON.stringify(root.controller.state) + ")");
        root.evaluate("window.mioHost && window.mioHost.setVisible(" + (root.controller.shown ? "true" : "false") + ")");
        root.evaluate("window.mioHost && window.mioHost.attention(" + root.controller.attentionX + ", " + root.controller.attentionY + ", " + (root.controller.attentionActive ? "true" : "false") + ")");
        root.evaluate("window.mioHost && window.mioHost.refreshWallpaper(" + root.controller.wallpaperRevision + ")");
    }

    WebEngineView {
        id: webView
        anchors.fill: parent
        backgroundColor: "transparent"
        focus: false
        url: "mio://app/desktop.html?screen=" + encodeURIComponent(root.screenName)

        onLoadingChanged: function(loadRequest) {
            if (loadRequest.status === WebEngineView.LoadSucceededStatus) {
                root.pageReady = true;
                root.syncAll();
            } else if (loadRequest.status === WebEngineView.LoadFailedStatus) {
                root.pageReady = false;
            }
        }
    }

    Connections {
        target: root.controller

        function onStateChanged() {
            root.evaluate("window.mioHost && window.mioHost.state(" + JSON.stringify(root.controller.state) + ")");
        }

        function onShownChanged() {
            root.evaluate("window.mioHost && window.mioHost.setVisible(" + (root.controller.shown ? "true" : "false") + ")");
        }

        function onAttentionChanged() {
            root.evaluate("window.mioHost && window.mioHost.attention(" + root.controller.attentionX + ", " + root.controller.attentionY + ", " + (root.controller.attentionActive ? "true" : "false") + ")");
        }

        function onActionScriptChanged() {
            root.evaluate(root.controller.actionScript);
        }

        function onWallpaperRevisionChanged() {
            root.evaluate("window.mioHost && window.mioHost.refreshWallpaper(" + root.controller.wallpaperRevision + ")");
        }
    }
}
