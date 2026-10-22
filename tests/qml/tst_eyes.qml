import QtQuick
import QtTest
import "../../build/wallpaper-ui" as Mio
import "../../eyes-core.js" as Core

Item {
    width: 1000
    height: 700

    Mio.EyeScene {
        id: eyes
        anchors.fill: parent
        simulation: Core.MioEyesCore.createSimulation({reducedMotion: true})
    }

    TestCase {
        name: "GpuEyes"
        when: windowShown

        function test_emotions_data() {
            return Core.MioEyesCore.EMOTIONS.map(function(emotion) {
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

        function test_soft_edges() {
            eyes.simulation.autonomous = false;
            eyes.simulation.setPointer(0, 0, false);
            eyes.simulation.setEmotion("idle");
            for (var i = 0; i < 240; ++i) eyes.advance(1 / 60);
            wait(50);
            var pixels = grabImage(eyes);
            var surface = findChild(eyes, "eyeSurface-l");
            var previous = -1;
            for (var offset of [-8, -4, 0, 4, 8]) {
                var point = surface.mapToItem(eyes,
                    -surface.surfaceOrigin.x - surface.eyeGeometry.x / 2 - offset,
                    -surface.surfaceOrigin.y);
                var green = pixels.green(Math.round(point.x * pixels.width / eyes.width),
                    Math.round(point.y * pixels.height / eyes.height));
                verify(green > previous + 3, "Eye edge must fade gradually into the background");
                previous = green;
            }
            var middle = surface.mapToItem(eyes,
                -surface.surfaceOrigin.x - surface.eyeGeometry.x / 2,
                -surface.surfaceOrigin.y);
            var corner = surface.mapToItem(eyes,
                -surface.surfaceOrigin.x - surface.eyeGeometry.x / 2,
                -surface.surfaceOrigin.y - surface.eyeGeometry.y / 2);
            var middleContrast = 255 - pixels.green(
                Math.round(middle.x * pixels.width / eyes.width),
                Math.round(middle.y * pixels.height / eyes.height));
            var cornerContrast = 255 - pixels.green(
                Math.round(corner.x * pixels.width / eyes.width),
                Math.round(corner.y * pixels.height / eyes.height));
            verify(cornerContrast < middleContrast * 0.72,
                "Two soft edges must fade together at the corner without a pointed flare");
        }
    }
}
