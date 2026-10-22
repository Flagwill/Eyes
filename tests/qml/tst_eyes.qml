import QtQuick
import QtTest
import "../../build/wallpaper-ui" as Eyes
import "../../eyes-core.js" as Core

Item {
    width: 1000
    height: 700

    Eyes.EyeScene {
        id: eyes
        anchors.fill: parent
        simulation: Core.EyesCore.createSimulation({reducedMotion: true})
    }

    TestCase {
        name: "GpuEyes"
        when: windowShown

        function test_emotions_data() {
            return Core.EyesCore.EMOTIONS.map(function(emotion) {
                return { tag: emotion.id };
            });
        }

        function test_emotions(data) {
            eyes.simulation.autonomous = false;
            eyes.simulation.energy = 0;
            eyes.simulation.setEmotion(data.tag);
            for (var i = 0; i < 240; ++i) eyes.advance(1 / 60);
            wait(50);
            var pixels = grabImage(eyes);
            var pixelScaleX = pixels.width / eyes.width;
            var pixelScaleY = pixels.height / eyes.height;
            verify(pixels.red(0, 0) > 250 && pixels.blue(0, 0) > 250,
                "Outside the eyes must preserve the window background");
            for (var side of ["l", "r"]) {
                var surface = findChild(eyes, "eyeSurface-" + side);
                verify(surface !== null);
                verify(surface.status !== ShaderEffect.Error, surface.log);
                verify(Math.abs(surface.eyeGeometry.x - eyes.pose[side + "w"]) < 0.001);
                var center = surface.mapToItem(eyes,
                    -surface.surfaceOrigin.x,
                    -surface.surfaceOrigin.y - surface.eyeGeometry.z);
                var x = Math.round(center.x * pixelScaleX);
                var y = Math.round(center.y * pixelScaleY);
                verify(pixels.alpha(x, y) > 240, "Eye center must be opaque");
                verify(pixels.blue(x, y) > pixels.red(x, y) + 20, "Eye must render purple");
            }
        }

        function test_attention_and_blink() {
            eyes.simulation.setEmotion("idle");
            eyes.simulation.setPointer(32, -20, true);
            for (var i = 0; i < 240; ++i) eyes.advance(1 / 60);
            verify(Math.abs(eyes.pose.gazeX - 32) < 0.01);
            verify(Math.abs(eyes.pose.lightGazeX - 32) < 0.01);
            var surface = findChild(eyes, "eyeSurface-l");
            var openHeight = surface.eyeGeometry.y;
            eyes.simulation.blink(false);
            eyes.advance(0.05);
            eyes.advance(0.05);
            verify(surface.eyeGeometry.y < openHeight * 0.1);
            for (var j = 0; j < 60; ++j) eyes.advance(1 / 60);
            verify(surface.eyeGeometry.y > openHeight * 0.99);
        }

        function test_crisp_silhouette_data() {
            return test_emotions_data();
        }

        function test_crisp_silhouette(data) {
            eyes.simulation.autonomous = false;
            eyes.simulation.setPointer(0, 0, false);
            eyes.simulation.setEmotion(data.tag);
            for (var i = 0; i < 240; ++i) eyes.advance(1 / 60);
            wait(50);
            var pixels = grabImage(eyes);
            for (var side of ["l", "r"]) {
                var surface = findChild(eyes, "eyeSurface-" + side);
                var width = surface.eyeGeometry.x;
                var height = surface.eyeGeometry.y;
                // Sample both sides of every edge, away from the corners.
                for (var axis of ["x", "y"]) for (var sign of [-1, 1]) {
                    var origin = surface.mapToItem(eyes, 0, 0);
                    var step = surface.mapToItem(eyes, axis === "x" ? 1 : 0, axis === "y" ? 1 : 0);
                    var pixelsPerUnit = Math.hypot((step.x - origin.x) * pixels.width / eyes.width,
                        (step.y - origin.y) * pixels.height / eyes.height);
                    var inset = 2 / pixelsPerUnit;
                    for (var inside of [true, false]) {
                        var offset = inside ? -inset : inset;
                        var x = axis === "x" ? sign * (width / 2 + offset) : 0;
                        var y = axis === "y" ? sign * (height / 2 + offset) - surface.eyeGeometry.z : 0;
                        var point = surface.mapToItem(eyes,
                            x - surface.surfaceOrigin.x, y - surface.surfaceOrigin.y);
                        var green = pixels.green(Math.round(point.x * pixels.width / eyes.width),
                            Math.round(point.y * pixels.height / eyes.height));
                        if (inside) verify(green < 145, "Eye must be solid purple two pixels inside its contour");
                        else compare(green, 255, "Two pixels outside the contour must be clear, without feather or glow");
                    }
                }
            }
        }
    }
}
