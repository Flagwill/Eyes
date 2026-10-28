import QtQuick
import QtQuick.Window
import QtTest
import "../../build/wallpaper-ui" as Eyes
import "../../build/wallpaper-ui/eyes-core.js" as Core

Item {
    id: testScene
    property real edgeOffset: 0
    // X11 constrains oversized test windows to the monitor. Keep item and
    // window bounds equal so grabImage coordinates also work at high DPI.
    width: Math.min(1000, Math.max(560, Screen.width - 64))
    height: Math.min(700, Math.max(360, Screen.height - 96))
    Eyes.RiveEyeScene {
        id: eyes
        anchors.fill: parent
        simulation: Core.EyesCore.createSimulation({reducedMotion: true})
        renderer.x: -renderer.width / 2 + testScene.edgeOffset / renderPixelRatio
        renderer.y: -renderer.height / 2 + testScene.edgeOffset * .43 / renderPixelRatio
    }
    Component {
        id: freshScene
        Eyes.RiveEyeScene {
            width: testScene.width
            height: testScene.height
        }
    }
    TestCase {
        name: "RiveGpuEyes"
        when: windowShown
        SignalSpy {
            id: nativeUpdates
            target: eyes.renderer
            signalName: "frameRateChanged"
        }
        Rectangle {
            id: unrelatedItem
            width: 5; height: 5
            visible: false
            NumberAnimation on opacity {
                id: unrelatedAnimation
                from: .1; to: 1; duration: 180; loops: Animation.Infinite
                running: false
            }
        }
        function init() {
            testScene.edgeOffset = 0;
            eyes.opacity = 1;
            eyes.simulation = Core.EyesCore.createSimulation({reducedMotion: true});
            eyes.simulation.autonomous = false;
            eyes.simulation.follow = false;
            eyes.advance(0);
            tryCompare(eyes, "loaded", true, 10000);
        }
        function settle(emotion) {
            eyes.simulation.setEmotion(emotion);
            for (let i = 0; i < 240; i++) eyes.advance(1 / 60);
            wait(90);
        }
        function point(side, u, v, inset) {
            const pose = Core.EyesCore.getPose(eyes.simulation.emotion);
            const eye = Core.EyesCore.getEyeGeometry(pose, side, 0, 0);
            const local = Core.EyesCore.getSurfacePoint(eye, u, v);
            const x = 280 + pose[side + "x"] + local.x;
            const y = 170 + pose[side + "y"] + local.y + (inset || 0);
            return eyes.renderer.mapToItem(eyes, x / 560 * eyes.renderer.width,
                y / 340 * eyes.renderer.height);
        }
        function sample(image, p) {
            const x = Math.round(p.x * image.width / eyes.width);
            const y = Math.round(p.y * image.height / eyes.height);
            return {r: image.red(x,y), g: image.green(x,y), b: image.blue(x,y)};
        }
        function test_all_expressions_data() {
            return Core.EyesCore.EMOTIONS.map(e => ({tag:e.id}));
        }
        function test_all_expressions(data) {
            settle(data.tag);
            const image = grabImage(eyes);
            verify(image.red(0,0) > 250 && image.green(0,0) > 250,
                "Rive artboard must preserve the wallpaper outside the eyes");
            for (const side of ["l","r"]) {
                const center = sample(image, point(side,0,0));
                verify(center.b > center.r + 20 && center.g < 150,
                    "The requested expression must render as an opaque purple eye");
                for (const u of [-.8,-.6,-.4,-.2,0,.2,.4,.6,.8]) {
                    const inset = 3 / (eyes.renderer.height / 340);
                    for (const edge of [-1,1]) {
                        const inside = sample(image,point(side,u,edge,-edge*inset));
                        const outside = sample(image,point(side,u,edge,edge*inset));
                        verify(inside.g < 150,"The vector contour must agree with the shared spline");
                        verify(outside.g > 250,"No feathering or glow may escape the vector contour");
                    }
                }
            }
        }
        function test_blink_and_input_transparency() {
            settle("idle");
            compare(eyes.renderer.enabled,false);
            compare(eyes.renderer.interactive,false);
            const open = grabImage(eyes);
            eyes.simulation.blink();
            eyes.advance(.05); eyes.advance(.05);
            wait(80);
            const closed = grabImage(eyes);
            const p = point("l",0,0);
            verify(sample(open,p).g < 150);
            verify(sample(closed,p).g > 250,"Blink must actually close the rendered upper lid");
            for (let i=0;i<60;i++) eyes.advance(1/60);
            wait(80);
            verify(sample(grabImage(eyes),p).g < 150);
        }
        function test_entry_reaches_the_native_eyelid() {
            settle("idle");
            eyes.simulation.autonomous = true;
            eyes.simulation.reducedMotion = false;
            eyes.simulation.nextBlink = 100;
            eyes.simulation.setEmotion("happy");
            for (let i = 0; i < 30; i++) {
                eyes.advance(1 / 60);
                wait(17);
            }
            const liftedEdge = point("r", 0, -1, -6);
            verify(sample(grabImage(eyes), liftedEdge).g < 180,
                "Joy's entry must actually lift the rendered lid above its resting outline");
            eyes.simulation.autonomous = false;
            for (let i = 0; i < 180; i++) eyes.advance(1 / 60);
            wait(100);
            verify(sample(grabImage(eyes), liftedEdge).g > 250,
                "The onset must settle back smoothly when natural acting is disabled");
        }
        function test_render_target_follows_output_size() {
            compare(eyes.renderer.width,560*eyes.layout.scale*eyes.renderPixelRatio);
            compare(eyes.renderer.height,340*eyes.layout.scale*eyes.layout.stretchY*eyes.renderPixelRatio);
            verify(eyes.renderer.width>560,"The GPU target must grow with the scene");
        }
        function test_held_pose_does_not_schedule_native_updates() {
            settle("happy");
            nativeUpdates.clear();
            wait(180);
            compare(nativeUpdates.count, 0,
                "A held model must stop the native self-scheduling loop");
            unrelatedItem.visible = true;
            unrelatedAnimation.start();
            wait(220);
            unrelatedAnimation.stop();
            unrelatedItem.visible = false;
            compare(nativeUpdates.count, 0,
                "Other Plasma animations must reuse the held vector texture");
            verify(sample(grabImage(eyes), point("l",0,0)).g < 150,
                "The last model update must reach the cached GPU texture");
        }
        function test_resume_from_hidden_updates_the_cached_texture() {
            settle("idle");
            eyes.visible = false;
            eyes.simulation.setEmotion("happy");
            for (let i = 0; i < 240; i++) eyes.advance(1 / 60);
            wait(60);
            eyes.visible = true;
            eyes.advance(0);
            wait(120);
            verify(sample(grabImage(eyes), point("l",0,0)).g < 150);
        }
        function test_lazy_load_initializes_a_held_expression() {
            const simulation = Core.EyesCore.createSimulation({reducedMotion:true});
            simulation.setEmotion("happy");
            for (let i = 0; i < 240; i++) simulation.update(1 / 60);
            const fresh = createTemporaryObject(freshScene, testScene, {simulation:simulation});
            verify(fresh !== null);
            fresh.advance(0);
            tryCompare(fresh, "loaded", true, 10000);
            wait(120);
            const star = fresh.renderer.mapToItem(fresh,
                (280 + 211) / 560 * fresh.renderer.width,
                (170 - 65) / 340 * fresh.renderer.height);
            const image = grabImage(fresh);
            const x = Math.round(star.x * image.width / fresh.width);
            const y = Math.round(star.y * image.height / fresh.height);
            verify(image.green(x,y) < 237 && image.blue(x,y) > image.green(x,y) + 12,
                "A lazily loaded renderer must show held inputs without another model tick");
        }
        function test_curved_edges_have_pixel_coverage_data() {
            const rows = [];
            for (const e of Core.EyesCore.EMOTIONS) for (const offset of [0, .375, .75])
                rows.push({tag: e.id + "-" + offset, emotion: e.id, offset: offset});
            return rows;
        }
        function test_curved_edges_have_pixel_coverage(data) {
            testScene.edgeOffset = data.offset;
            settle(data.emotion);
            const image = grabImage(eyes);
            const sx = image.width / eyes.width, sy = image.height / eyes.height;
            let columns = 0, covered = 0, broad = 0;
            for (const side of ["l", "r"]) for (const edge of [-1, 1]) {
                let previousX = -1;
                for (let i = 0; i <= 160; i++) {
                    const p = point(side, -.8 + i * .01, edge);
                    const x = Math.round(p.x * sx), y = Math.round(p.y * sy);
                    if (x === previousX) continue;
                    previousX = x;
                    let partial = 0;
                    for (let dy = -4; dy <= 4; dy++) {
                        const green = image.green(x, y + dy);
                        if (green > 155 && green < 245) partial++;
                    }
                    columns++;
                    if (partial > 0) covered++;
                    if (partial > 2) broad++;
                }
            }
            verify(covered / columns > .6,
                "Curved edges need fractional pixel coverage, not binary stair steps: " + covered + "/" + columns);
            verify(broad / columns < .05,
                "Edge antialiasing must stay within two physical pixels, without a blurred silhouette");
        }
        function test_happy_band_has_constant_thickness() {
            settle("happy");
            const image=grabImage(eyes),heights=[];
            for(const u of [-.65,-.3,0,.3,.65]) {
                const p=point("l",u,0), x=Math.round(p.x*image.width/eyes.width);
                let count=0;
                const scale=image.height/eyes.height, centerY=p.y*scale;
                for(let y=Math.floor(centerY-55*scale);y<Math.ceil(centerY+55*scale);y++) {
                    if(image.green(x,y)<150)count++;
                }
                heights.push(count);
            }
            verify(Math.max(...heights)-Math.min(...heights)<=2,
                "Rive must preserve the smile's parallel cubic lids");
        }
        function test_fade_composites_premultiplied_coverage_once() {
            settle("happy");
            const p = point("l", 0, 0);
            const full = sample(grabImage(eyes), p);
            eyes.opacity = .5;
            wait(90);
            const faded = sample(grabImage(eyes), p);
            for (const channel of ["r", "g", "b"])
                verify(Math.abs(faded[channel] - (255 + full[channel]) / 2) < 4,
                    "Fades must blend premultiplied colour once, without dark fringes");
        }
        function modelPoint(x,y) {
            return eyes.renderer.mapToItem(eyes,(280+x)/560*eyes.renderer.width,
                (170+y)/340*eyes.renderer.height);
        }
        function test_accessories_data() {
            return [
                {tag:"happy", x:211,y:-65},
                {tag:"curious",x:214.9,y:-88.3},
                {tag:"thinking",x:-199,y:15},
                // The inner brow head extends past the eye's horizontal edge.
                {tag:"focused",x:-24.34,y:-30.47},
                {tag:"surprised",x:-212,y:-103},
                {tag:"sleepy",x:207,y:-34.5},
                {tag:"confused",x:215.08,y:-59}
            ];
        }
        function test_accessories(data) {
            settle(data.tag);
            const p=modelPoint(data.x,data.y);
            const visible=sample(grabImage(eyes),p);
            verify(visible.g<237 && visible.b>visible.g+12,
                data.tag+" needs a visible secondary purple vector cue outside the eye");
            eyes.simulation.accents=false;
            eyes.advance(1/60);
            wait(90);
            verify(sample(grabImage(eyes),p).g>250,
                "Disabling accessories must clear their actual pixels");
        }
        function test_glasses_have_clear_lenses_and_do_not_blink() {
            settle("thinking");
            const rim=modelPoint(-199,15), lens=modelPoint(-112,-37);
            const before=sample(grabImage(eyes),rim).g;
            verify(sample(grabImage(eyes),lens).g>250,
                "Glasses are hollow vector rims, with no opaque lens panel");
            eyes.simulation.blink();eyes.advance(.05);eyes.advance(.05);
            wait(90);
            verify(Math.abs(sample(grabImage(eyes),rim).g-before)<3,
                "Blinking must not squash or fade glasses");
        }
        function test_question_fades_through_intermediate_coverage() {
            settle("curious");
            const p=modelPoint(214.9,-88.3);
            const before=sample(grabImage(eyes),p).g;
            eyes.simulation.setEmotion("idle");
            for(let i=0;i<6;i++)eyes.advance(1/60);
            wait(90);
            const middle=sample(grabImage(eyes),p).g;
            verify(middle>before+3 && middle<250,
                "Outgoing symbols must fade continuously instead of disappearing on a state switch");
            settle("idle");
            verify(sample(grabImage(eyes),p).g>250,"No question mark may remain after settling");
        }
    }
}
