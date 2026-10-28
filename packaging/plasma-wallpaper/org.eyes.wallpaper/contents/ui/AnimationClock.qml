import QtQuick

FrameAnimation {
    id: clock
    property real framesPerSecond: 60
    property real budget: 0
    property real pendingDelta: 0
    signal advance(real delta)

    onRunningChanged: {
        budget = 0;
        pendingDelta = 0;
    }
    onTriggered: {
        const delta = frameTime > 0 ? frameTime : 1 / 60;
        const interval = 1 / Math.max(20, Math.min(60, framesPerSecond));
        budget += delta;
        pendingDelta += delta;
        if (budget + 0.0001 < interval) return;
        // Preserve real elapsed time and fractional refresh periods, including
        // on 75/144 Hz monitors. Hidden time is discarded on restart.
        const elapsed = pendingDelta;
        pendingDelta = 0;
        budget = Math.max(0, budget - interval) % interval;
        advance(elapsed);
    }
}
