function pushCursorPosition() {
    const point = workspace.cursorPos;
    callDBus(
        "org.eyes.Desktop",
        "/Cursor",
        "org.eyes.Desktop",
        "SetPosition",
        Math.round(point.x),
        Math.round(point.y)
    );
}

workspace.cursorPosChanged.connect(pushCursorPosition);
pushCursorPosition();
