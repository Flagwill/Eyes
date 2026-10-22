function pushCursorPosition() {
    const point = workspace.cursorPos;
    callDBus(
        "com.mio.Eyes",
        "/Cursor",
        "com.mio.Eyes",
        "SetPosition",
        Math.round(point.x),
        Math.round(point.y)
    );
}

workspace.cursorPosChanged.connect(pushCursorPosition);
pushCursorPosition();
