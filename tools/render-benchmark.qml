import QtQuick
import "../build/wallpaper-ui" as Eyes
import "../build/wallpaper-ui/eyes-core.js" as Core

Item {
    width: 1600
    height: 1001
    Eyes.RiveEyeScene {
        id: eyes
        anchors.fill: parent
        simulation: Core.EyesCore.createSimulation({random: () => .5})
        Component.onCompleted: {
            simulation.resize(width, height);
            simulation.follow = false;
            simulation.setActivity("editing");
            advance(0);
        }
    }
    Eyes.AnimationClock {
        running: eyes.loaded
        framesPerSecond: 60
        onAdvance: delta => eyes.advance(delta)
    }
}
