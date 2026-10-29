import QtQuick
import QtTest
import "../../build/wallpaper-ui" as Eyes
import "../../build/wallpaper-ui/eyes-core.js" as Core

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

        function init() {
            eyes.simulation = Core.EyesCore.createSimulation({reducedMotion: true});
            eyes.simulation.accents = false;
            eyes.advance(0);
        }

        function modelEye(side) {
            return Core.EyesCore.getEyeGeometry(eyes.pose, side, eyes.blink,
                eyes.frame ? eyes.frame.breathe : 0);
        }

        function test_emotions_data() {
            return Core.EyesCore.EXPRESSIONS.map(function(emotion) {
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
                    -surface.surfaceOrigin.y + Core.EyesCore.getSurfacePoint(modelEye(side), 0, 0).y);
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
                        var edge = Core.EyesCore.getEyeEdges(modelEye(side), 0);
                        var y = axis === "y" ? (sign < 0 ? edge.upper : edge.lower) + sign * offset :
                            Core.EyesCore.getSurfacePoint(modelEye(side), sign, 0).y;
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

        function test_upper_lid_leads_blink() {
            eyes.simulation.autonomous = false;
            eyes.advance(0);
            var surface = findChild(eyes, "eyeSurface-l");
            function edge(sign) {
                return surface.mapToItem(eyes, -surface.surfaceOrigin.x,
                    -surface.surfaceOrigin.y + Core.EyesCore.getSurfacePoint(modelEye("l"), 0, sign).y);
            }
            var upper = edge(-1), lower = edge(1);
            eyes.simulation.blink(false);
            eyes.advance(0.05);
            eyes.advance(0.05);
            var upperTravel = edge(-1).y - upper.y;
            var lowerTravel = lower.y - edge(1).y;
            verify(upperTravel > lowerTravel * 2 && lowerTravel > 0,
                "The upper lid must travel farther than the lower lid");
            wait(50);
            var pixels = grabImage(eyes);
            var slit = edge(0);
            var x = Math.round(slit.x * pixels.width / eyes.width);
            var y = Math.round(slit.y * pixels.height / eyes.height);
            verify(pixels.blue(x, y) > pixels.red(x, y) + 20,
                "The closed slit must be drawn at the lower meeting point");
            compare(pixels.green(x, Math.round(upper.y * pixels.height / eyes.height) + 3), 255,
                "The descending upper lid must clear the old upper eye surface");
        }

        function test_broad_light_has_gentle_depth() {
            var pose = Core.EyesCore.getPose("idle");
            pose.lightBreath = 0;
            eyes.frame = {pose: pose, blink: 0, breathe: 0, bounce: 0, alive: false};
            wait(50);
            var lit = grabImage(eyes);
            var surface = findChild(eyes, "eyeSurface-l");
            var geometry = surface.lightGeometry;
            function sample(image, fraction) {
                var local = Core.EyesCore.getSurfacePoint(modelEye("l"), geometry.x,
                    geometry.y + geometry.w * fraction);
                var p = surface.mapToItem(eyes, local.x - surface.surfaceOrigin.x,
                    local.y - surface.surfaceOrigin.y);
                return image.green(Math.round(p.x * image.width / eyes.width),
                    Math.round(p.y * image.height / eyes.height));
            }
            var unlitPose = Core.EyesCore.getPose("idle");
            unlitPose.lightStrength = 0;
            eyes.frame = {pose: unlitPose, blink: 0, breathe: 0, bounce: 0, alive: false};
            wait(50);
            var unlit = grabImage(eyes);
            var centerBase = sample(unlit, 0), edgeBase = sample(unlit, 0.8);
            var centerLift = sample(lit, 0) - centerBase;
            var edgeLift = sample(lit, 0.8) - edgeBase;
            verify(centerLift >= 8 && centerLift < 22,
                "The diffuse field must have visible but quiet depth");
            verify(edgeLift < centerLift / 2,
                "The field must fade smoothly without a nested eye contour");
        }

        function test_local_node_deforms_gpu() {
            var pose = Core.EyesCore.getPose("idle");
            eyes.frame = {pose: pose, blink: 0, breathe: 0, bounce: 0, alive: false};
            var model = modelEye("l");
            var edge = Core.EyesCore.getEyeEdges(model, -0.5);
            var surface = findChild(eyes, "eyeSurface-l");
            var localX = -model.width / 4;
            var localY = edge.upper - 5;
            var point = surface.mapToItem(eyes,
                localX - surface.surfaceOrigin.x, localY - surface.surfaceOrigin.y);
            wait(50);
            var before = grabImage(eyes);
            var x = Math.round(point.x * before.width / eyes.width);
            var y = Math.round(point.y * before.height / eyes.height);
            compare(before.green(x, y), 255, "The sample starts outside the upper lid");
            var sculpted = Core.EyesCore.getPose("idle");
            sculpted.lu1 -= 12;
            eyes.frame = {pose: sculpted, blink: 0, breathe: 0, bounce: 0, alive: false};
            wait(50);
            var after = grabImage(eyes);
            verify(after.green(x, y) < 145,
                "The independently sculpted shoulder must change actual GPU pixels");
        }

        function test_light_follows_full_smile() {
            var pose = Core.EyesCore.getPose("happy");
            pose.lightX = 0;
            pose.lightY = 0;
            pose.lightHeight = 0.25;
            pose.lightSpread = 0.86;
            pose.lightStrength = 0.2;
            eyes.frame = {pose: pose, blink: 0, breathe: 0, bounce: 0, alive: false};
            var model = modelEye("l");
            var surface = findChild(eyes, "eyeSurface-l");
            var points = [-0.55, 0, 0.55].map(function(u) {
                var local = Core.EyesCore.getSurfacePoint(model, u, 0);
                return surface.mapToItem(eyes, local.x - surface.surfaceOrigin.x,
                    local.y - surface.surfaceOrigin.y);
            });
            wait(50);
            var lit = grabImage(eyes);
            var unlitPose = Core.EyesCore.getPose("happy");
            unlitPose.lightStrength = 0;
            eyes.frame = {pose: unlitPose, blink: 0, breathe: 0, bounce: 0, alive: false};
            wait(50);
            var unlit = grabImage(eyes);
            for (var point of points) {
                var x = Math.round(point.x * lit.width / eyes.width);
                var y = Math.round(point.y * lit.height / eyes.height);
                verify(lit.green(x, y) - unlit.green(x, y) >= 3,
                    "The narrow reflection must follow the smile beyond its center tangent");
            }
        }

        function test_eyelid_edges_data() {
            return test_emotions_data();
        }

        function test_eyelid_edges(data) {
            eyes.simulation.autonomous = false;
            eyes.simulation.setEmotion(data.tag);
            for (var i = 0; i < 240; ++i) eyes.advance(1 / 60);
            wait(50);
            var pixels = grabImage(eyes);
            for (var side of ["l", "r"]) {
                var surface = findChild(eyes, "eyeSurface-" + side);
                var origin = surface.mapToItem(eyes, 0, 0);
                var step = surface.mapToItem(eyes, 0, 1);
                var pixelsPerUnit = Math.hypot((step.x - origin.x) * pixels.width / eyes.width,
                    (step.y - origin.y) * pixels.height / eyes.height);
                for (var u of [-0.85, -0.5, -0.25, 0, 0.25, 0.5, 0.85]) for (var edge of [-1, 1]) for (var inside of [true, false]) {
                    var model = modelEye(side);
                    var x = surface.eyeGeometry.x * u / 2;
                    var boundary = Core.EyesCore.getEyeEdges(model, u);
                    var y = edge < 0 ? boundary.upper : boundary.lower;
                    var before = Core.EyesCore.getEyeEdges(model, u - 0.0001);
                    var after = Core.EyesCore.getEyeEdges(model, u + 0.0001);
                    var slope = edge < 0 ? after.upper - before.upper : after.lower - before.lower;
                    slope /= model.width * 0.0001;
                    var normal = Math.hypot(1, slope);
                    var distance = (inside ? -2 : 2) / pixelsPerUnit;
                    x -= edge * slope * distance / normal;
                    y += edge * distance / normal;
                    var point = surface.mapToItem(eyes,
                        x - surface.surfaceOrigin.x, y - surface.surfaceOrigin.y);
                    var green = pixels.green(Math.round(point.x * pixels.width / eyes.width),
                        Math.round(point.y * pixels.height / eyes.height));
                    if (inside) verify(green < 145, "Sloped lids must retain a solid eye surface");
                    else compare(green, 255, "Sloped lids must clip cleanly, without a ghost edge");
                }
            }
        }
    }
}
