import QtQuick
import QtTest
import "../../build/wallpaper-ui" as Eyes

Item {
    width: 64
    height: 64
    Eyes.AnimationClock {
        id: clock
        property int updates: 0
        property real simulatedTime: 0
        property real largestDelta: 0
        onAdvance: function(delta) {
            updates++;
            simulatedTime += delta;
            largestDelta = Math.max(largestDelta, delta);
        }
    }
    TestCase {
        name: "ResidentAnimationClock"
        when: windowShown
        function init() {
            clock.running = false;
            clock.updates = 0;
            clock.simulatedTime = 0;
            clock.largestDelta = 0;
        }
        function cleanup() { clock.running = false; }
        function test_stopped_clock_has_no_updates() {
            wait(160);
            compare(clock.updates, 0);
        }
        function test_rate_limit_preserves_elapsed_time_data() {
            return [{tag: "minimum", fps:20}, {tag: "balanced", fps:30}, {tag: "default", fps:60}];
        }
        function test_rate_limit_preserves_elapsed_time(data) {
            clock.framesPerSecond = data.fps;
            clock.running = true;
            wait(1100);
            clock.running = false;
            verify(clock.updates <= data.fps * 1.2,
                "Updates must be bounded independently of the display refresh rate");
            verify(clock.updates >= data.fps * .65,
                "The model must continue animating at the selected rate");
            verify(clock.simulatedTime > .9 && clock.simulatedTime < 1.3,
                "Reducing rendering frequency must not slow the shared animation clock");
        }
        function test_restart_does_not_catch_up_hidden_time() {
            clock.running = true;
            wait(150);
            clock.running = false;
            const stopped = clock.updates;
            wait(250);
            compare(clock.updates, stopped);
            clock.largestDelta = 0;
            clock.running = true;
            wait(150);
            verify(clock.updates > stopped);
            verify(clock.largestDelta < .15,
                "Hidden time must not become a large resume step");
        }
    }
}
