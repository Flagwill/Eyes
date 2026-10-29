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
            eyes.simulation.accents = false;
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
        function contourNormal(side, u, edge) {
            const origin = point(side, u, edge);
            const adjacent = point(side, u + 0.001, edge);
            const tx = adjacent.x - origin.x, ty = adjacent.y - origin.y;
            const length = Math.hypot(tx, ty);
            let nx = -ty / length, ny = tx / length;
            if ((edge < 0 && ny > 0) || (edge > 0 && ny < 0)) {
                nx = -nx;
                ny = -ny;
            }
            return {x:nx, y:ny, point:origin};
        }
        function test_all_expressions_data() {
            return Core.EyesCore.EXPRESSIONS.map(e => ({tag:e.id}));
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
                    const outputPixels = image.width / eyes.width;
                    const inset = 3 / outputPixels;
                    for (const edge of [-1,1]) {
                        const normal = contourNormal(side,u,edge);
                        const inside = sample(image, {
                            x:normal.point.x-normal.x*inset,
                            y:normal.point.y-normal.y*inset,
                        });
                        const outside = sample(image, {
                            x:normal.point.x+normal.x*inset,
                            y:normal.point.y+normal.y*inset,
                        });
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
            for (const e of Core.EyesCore.EXPRESSIONS) for (const offset of [0, .375, .75])
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
                    // Compare with the adjacent opaque surface. A fixed green
                    // cutoff discarded valid 62.5–87.5% MSAA coverage on dark
                    // purple lids at some DPR=2 phases.
                    const solid = image.green(x, y - edge * 4);
                    for (let dy = -4; dy <= 4; dy++) {
                        const green = image.green(x, y + dy);
                        const coverage = (255 - green) / Math.max(1, 255 - solid);
                        if (coverage > .1 && coverage < .9) partial++;
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
        function test_face_perspective_data() {
            const rows=[];
            for(const e of Core.EyesCore.EXPRESSIONS) for(const direction of [-1,1])
                rows.push({tag:e.id+"-"+direction,emotion:e.id,direction:direction});
            return rows;
        }
        function test_face_perspective(data) {
            eyes.simulation.follow=true;
            eyes.simulation.setPointer(data.direction*40,-20,true);
            settle(data.emotion);
            const image=grabImage(eyes);
            for(const x of [-112,112]) {
                const actual=modelPoint(x,0),m=eyes.frame.face.matrix;
                const w=m[12]*x+1;
                const expectedX=eyes.layout.centerX+eyes.pose.gazeX*eyes.layout.scale+
                    m[0]*x/w*eyes.layout.scale;
                const expectedY=eyes.layout.centerY+eyes.pose.gazeY*eyes.layout.scale*
                    eyes.layout.stretchY*eyes.layout.gazeScaleY+m[4]*x/w*
                    eyes.layout.scale*eyes.layout.stretchY;
                verify(Math.abs(actual.x-expectedX)<.05 && Math.abs(actual.y-expectedY)<.05,
                    "Qt must use the shared perspective division, including high DPI");
            }
            for(const side of ["l","r"])
                verify(sample(image,point(side,0,0)).g<180,
                    "Turned eyes must actually render at their projected surface centers");
            function span(x) {
                const a=modelPoint(x,-20),b=modelPoint(x,20);
                return Math.hypot(a.x-b.x,a.y-b.y);
            }
            verify(data.direction>0 ? span(-112)>span(112) : span(112)>span(-112),
                "The near side must grow while the opposite side recedes");
        }
        function test_small_elements_share_the_face_plane() {
            eyes.simulation.follow=true;
            eyes.simulation.accents=true;
            eyes.simulation.setPointer(40,-20,true);
            settle("curious");
            const p=modelPoint(214.9,-88.3);
            verify(sample(grabImage(eyes),p).g<240,"The question mark must turn with both eyes");
            eyes.simulation.blink();eyes.advance(.05);eyes.advance(.05);wait(90);
            verify(sample(grabImage(eyes),p).g<240,"Turning accessories must remain independent of blink squash");
            eyes.simulation.accents=false;eyes.advance(0);wait(90);
            verify(sample(grabImage(eyes),p).g>250,"The turned accessory must still obey visibility");
        }
        function test_accessories_data() {
            return [
                {tag:"happy", x:211,y:-65},
                {tag:"curious",x:214.9,y:-88.3},
                {tag:"focused",x:-108,y:-40.84},
                {tag:"surprised",x:-212,y:-103},
                {tag:"sleepy",x:207,y:-34.5},
                {tag:"confused",x:215.08,y:-59}
            ];
        }
        function test_accessories(data) {
            eyes.simulation.accents=true;
            settle(data.tag);
            const p=modelPoint(data.x,data.y);
            const visible=sample(grabImage(eyes),p);
            verify(visible.g<237 && visible.b>visible.g+12,
                data.tag+" needs a visible secondary vector cue at its authored position");
            eyes.simulation.accents=false;
            eyes.advance(1/60);
            wait(90);
            verify(sample(grabImage(eyes),p).g>250,
                "Disabling accessories must clear their actual pixels");
        }
        function test_accessories_do_not_blink() {
            eyes.simulation.accents=true;
            settle("happy");
            const p=modelPoint(211,-65);
            const before=sample(grabImage(eyes),p);
            eyes.simulation.blink();eyes.advance(.05);eyes.advance(.05);
            wait(90);
            const during=sample(grabImage(eyes),p);
            verify(Math.abs(during.g-before.g)<3 && Math.abs(during.b-before.b)<3,
                "Accessories must stay outside the eyelid blink node");
        }
        function test_activity_props_data() {
            return Core.EyesCore.ACTIVITIES.filter(e => e.id !== "listening" && e.id !== "complete")
                .map(e => ({tag:e.id}));
        }
        function propRegion() {
            const states=Core.EyesCore.getAccentStates(eyes.pose);
            const design=Core.EyesCore.accentDesigns.find(d => d.prop && d.depth>0 && states[d.id].opacity>.1);
            const state=states[design.id];
            return {x:state.x,y:state.y};
        }
        function test_activity_props(data) {
            eyes.simulation.accents=true;
            settle(data.tag);
            const before=grabImage(eyes),region=propRegion();
            eyes.simulation.accents=false; eyes.advance(1/60); wait(90);
            const clear=grabImage(eyes),mask=[];
            let differences=0;
            for(let x=region.x-40;x<region.x+44;x+=2) for(let y=region.y-42;y<region.y+42;y+=2) {
                const p=modelPoint(x,y),a=sample(before,p),b=sample(clear,p);
                if(Math.abs(a.g-b.g)>10)differences++;
                const awayFromEyes=["l","r"].every(side => {
                    const eye=Core.EyesCore.getEyeGeometry(eyes.pose,side,0,0);
                    return Math.abs(x-eyes.pose[side+"x"])>eye.width/2+10 ||
                        Math.abs(y-eyes.pose[side+"y"])>eye.extent+10;
                });
                if(awayFromEyes&&b.g>250&&a.g<239&&a.b>a.g+10)mask.push(p);
            }
            verify(differences>8,data.tag+" must render its vector object above the eye scene");
            if(data.tag!=="searching"&&data.tag!=="debugging")
                verify(mask.length>3,data.tag+" must retain visible object edges outside the eye");
            eyes.simulation.accents=true;
            eyes.simulation.blink(); eyes.advance(.05); eyes.advance(.05); wait(90);
            const during=grabImage(eyes);
            for(const p of mask) verify(Math.abs(sample(before,p).g-sample(during,p).g)<4,
                "Object pixels must stay outside blink squash");
        }
        function test_question_fades_through_intermediate_coverage() {
            eyes.simulation.accents=true;
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
