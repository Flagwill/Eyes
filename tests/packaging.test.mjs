import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

test('desktop wallpaper renders the eyes without status copy or HUD labels', () => {
  const wallpaper = readFileSync(
    'packaging/plasma-wallpaper/org.eyes.wallpaper/contents/ui/main.qml',
    'utf8',
  );
  assert.doesNotMatch(wallpaper, /\bText\s*\{/);
  assert.doesNotMatch(wallpaper, /AGENT PRESENCE|DESKTOP HARNESS|hostState/);
});

test('user install is opt-in, exports a launchable app, and restarts only failures', () => {
  const installer = readFileSync('packaging/install-user.sh', 'utf8');
  assert.match(installer, /ConditionPathExists=!\$visibility_marker/);
  assert.match(installer, /Restart=on-failure/);
  assert.match(installer, /systemctl --user stop eyes-desktop\.service/);
  assert.ok(
    installer.indexOf('bin/eyes" quit') <
      installer.indexOf('systemctl --user stop eyes-desktop.service'),
    'the installer must request a restoring quit before a forced service stop',
  );
  assert.match(installer, /systemctl --user disable eyes-desktop\.service/);
  assert.match(installer, /rm -f "\$autostart_entry"/);
  assert.match(installer, /Exec="\$install_prefix\/bin\/eyes" show/);
  assert.doesNotMatch(installer, /Restart=always/);
  assert.doesNotMatch(installer, /systemctl --user enable eyes-desktop\.service/);
  assert.doesNotMatch(installer, /bin\/eyes" host-start/);
  assert.doesNotMatch(installer, /cat >"\$config_home\/autostart/);
  assert.match(installer, /--restore --recover-legacy/);
  assert.doesNotMatch(installer, /--mount/);
  assert.doesNotMatch(installer, /wallpaperPlugin = ['"]org\.eyes\.wallpaper/);
  assert.match(installer, /安装未更改原有壁纸/);

  const application = readFileSync('packaging/eyes-desktop.desktop', 'utf8');
  assert.match(application, /^Type=Application$/m);
  assert.match(application, /^Name=Eyes$/m);
  assert.match(application, /^Exec=eyes show$/m);
  assert.match(application, /^Icon=eyes-desktop$/m);
  assert.match(application, /^Actions=Hide;Quit;$/m);
});

test('upgrade retires legacy entry points and preserves Eyes and user images', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-upgrade-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const prefix = join(root, 'prefix');
  const config = join(root, 'config');
  const mocks = join(root, 'commands');
  const record = join(root, 'calls');
  function file(path, content = 'fixture', mode = 0o644) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { mode });
    chmodSync(path, mode);
  }
  const obsolete = [
    'bin/mio', 'bin/mio-desktop',
    'etc/xdg/autostart/mio-desktop-autostart.desktop',
    'share/applications/mio-desktop.desktop',
    'share/applications/kwin-mio-eyes-cursor.desktop',
    'share/icons/hicolor/scalable/apps/mio-desktop.svg',
    'share/kwin/scripts/mio-eyes-cursor/contents/code/main.js',
    'share/plasma/wallpapers/com.mio.Eyes/metadata.json',
  ];
  for (const name of obsolete) file(join(prefix, name));
  file(join(prefix, 'bin/mio'), '#!/bin/sh\nprintf "legacy-client %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', 0o755);
  const legacyAutostart = join(config, 'autostart/mio-desktop-autostart.desktop');
  file(legacyAutostart);
  const preserved = [join(prefix, 'bin/eyes'), join(prefix, 'bin/eyes-desktop'),
    join(config, 'autostart/eyes-desktop-autostart.desktop'),
    join(prefix, 'share/plasma/wallpapers/org.eyes.wallpaper/metadata.json'),
    join(root, 'wallpaper.jpg')];
  for (const path of preserved) file(path);
  for (const name of ['systemctl', 'kwriteconfig6', 'gdbus']) {
    file(join(mocks, name), `#!/bin/sh\nprintf '${name} %s\\n' "$*" >> "$EYES_TEST_RECORD"\n`, 0o755);
  }
  file(join(mocks, 'pgrep'), '#!/bin/sh\nexit 1\n', 0o755);
  execFileSync('bash', ['-c', 'source "$1"; stop_legacy_install; remove_legacy_install',
    'upgrade', resolve('packaging/migrate-legacy-install.sh')], {
    env: { ...process.env, install_prefix: prefix, config_home: config,
      PATH: `${mocks}:${process.env.PATH}`, EYES_TEST_RECORD: record },
  });
  for (const name of obsolete) assert.equal(existsSync(join(prefix, name)), false, name);
  assert.equal(existsSync(legacyAutostart), false);
  for (const path of preserved) assert.equal(readFileSync(path, 'utf8'), 'fixture');
  const calls = readFileSync(record, 'utf8');
  assert.match(calls, /legacy-client quit/);
  assert.match(calls, /stop mio-desktop.service/);
  assert.match(calls, /mio-eyes-cursorEnabled false/);
  assert.match(calls, /unloadScript mio-eyes-cursor/);
});

test('wallpaper mount records the exact desktop origin and is repeat-safe', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-mount-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  const state = join(root, 'state/eyes/wallpaper-origin.json');
  const calls = join(root, 'calls');
  const mocks = join(root, 'commands');
  mkdirSync(mocks);
  writeFileSync(config, `[Containments][7]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][7][Wallpaper][org.kde.image][General]
Image=file:///pre-mount.jpg
Color=#112233
FillMode=1
[Containments][8]
formfactor=2
plugin=org.kde.panel
wallpaperplugin=org.kde.image
[Containments][8][Wallpaper][org.kde.image][General]
Image=file:///panel.jpg
`);
  writeFileSync(join(mocks, 'kwriteconfig6'),
    '#!/bin/sh\n[ -f "$EYES_TEST_STATE" ] || printf "config-before-state\\n" >> "$EYES_TEST_RECORD"\nprintf "kwrite %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'kwriteconfig6'), 0o755);
  writeFileSync(join(mocks, 'qdbus6'),
    '#!/bin/sh\nprintf "qdbus %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'qdbus6'), 0o755);
  const env = { ...process.env, PATH: `${mocks}:${process.env.PATH}`,
    EYES_TEST_RECORD: calls, EYES_TEST_STATE: state };
  const run = () => JSON.parse(execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', config,
    '--state-file', state, '--mount', '--activate-runtime', '--json',
  ], { encoding: 'utf8', env }));
  const result = run();
  const actions = result.actions.flat().join(' ');
  assert.equal(result.ok, true);
  assert.doesNotMatch(readFileSync(calls, 'utf8'), /config-before-state/,
    'the origin state must be durable before any wallpaper config changes');
  assert.match(actions, /--group Wallpaper --group org\.eyes\.wallpaper --group General --key Image --notify file:\/\/\/pre-mount\.jpg/);
  assert.match(actions, /--key Color --notify #112233/);
  assert.match(actions, /--key FillMode --notify 1/);
  assert.match(actions, /--key wallpaperplugin --notify org\.eyes\.wallpaper/);
  assert.doesNotMatch(actions, /--group 8/);
  assert.deepEqual(result.containments.map(item => item.id), ['7']);

  const saved = JSON.parse(readFileSync(state, 'utf8'));
  assert.equal(saved.containments['7'].plugin, 'org.kde.image');
  assert.equal(saved.containments['7'].wallpaper['org.kde.image'].General.Image,
    'file:///pre-mount.jpg');
  assert.equal(saved.containments['8'], undefined, 'panels must never enter origin state');
  assert.equal(statSync(state).mode & 0o777, 0o600);

  writeFileSync(config, `[Containments][7]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.eyes.wallpaper
[Containments][7][Wallpaper][org.eyes.wallpaper][General]
Image=file:///stale-copy.jpg
Color=#ffffff
FillMode=2
[Containments][7][Wallpaper][org.kde.image][General]
Image=file:///pre-mount.jpg
Color=#112233
FillMode=1
[Containments][8]
formfactor=2
plugin=org.kde.panel
`);
  const repeat = run();
  assert.equal(repeat.ok, true);
  const repeated = JSON.parse(readFileSync(state, 'utf8'));
  assert.deepEqual(repeated.containments['7'],
    saved.containments['7'],
    'a repeated show must not replace the saved origin with Eyes');
  const recorded = readFileSync(calls, 'utf8');
  assert.match(recorded, /qdbus .*667|qdbus .*org\.kde\.PlasmaShell\.evaluateScript/);
  assert.match(recorded, /org\.eyes\.wallpaper/);
});

test('Eyes mounts on the primary screen only and hands the running desktop its settings', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-primary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  const state = join(root, 'state/eyes/wallpaper-origin.json');
  const script = join(root, 'runtime-script.js');
  const mocks = join(root, 'commands');
  mkdirSync(mocks);
  // Two activities share the primary screen 0; screen 1 is a second monitor.
  writeFileSync(config, `[Containments][3]
formfactor=0
lastScreen=1
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][3][Wallpaper][org.kde.image][General]
Image=file:///second-monitor.jpg
[Containments][4]
formfactor=0
lastScreen=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][4][Wallpaper][org.kde.image][General]
Image=file:///home/user/.local/share/wallpapers/Package
[Containments][5]
formfactor=0
lastScreen=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][5][Wallpaper][org.kde.image][General]
Image=file:///other-activity.jpg
FillMode=1
Color=#102030
`);
  writeFileSync(join(mocks, 'kwriteconfig6'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(mocks, 'qdbus6'), '#!/bin/sh\nprintf "%s" "$4" > "$EYES_TEST_SCRIPT"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'kwriteconfig6'), 0o755);
  chmodSync(join(mocks, 'qdbus6'), 0o755);
  const result = JSON.parse(execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', config,
    '--state-file', state, '--mount', '--activate-runtime', '--json',
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${mocks}:${process.env.PATH}`,
    EYES_TEST_SCRIPT: script } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds.sort(), ['4', '5']);
  assert.doesNotMatch(result.actions.flat().join(' '), /--group 3\b/, 'a second monitor keeps its wallpaper');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(state, 'utf8')).containments).sort(), ['4', '5']);

  // Execute the generated Plasma script against desktops that record calls.
  const { runInNewContext } = await import('node:vm');
  function desktop(id, plugin, { switches = true } = {}) {
    const calls = [];
    let current = plugin, group = [];
    return { calls, id,
      get wallpaperPlugin() { return current; },
      set wallpaperPlugin(value) { calls.push(['plugin', value]); if (switches) current = value; },
      set currentConfigGroup(value) { group = [...value]; calls.push(['group', group.join('/')]); },
      writeConfig(key, value) { calls.push(['write', `${group.join('/')}:${key}=${value}`, current]); },
    };
  }
  const desktops = [desktop(3, 'org.kde.image'), desktop(4, 'org.kde.image'),
    desktop(5, 'org.kde.image', { switches: false })];
  runInNewContext(readFileSync(script, 'utf8'), { desktops: () => desktops });
  assert.deepEqual(desktops[0].calls, [], 'the second monitor is not touched at runtime');
  const primary = desktops[1].calls;
  assert.deepEqual(primary[0], ['plugin', 'org.eyes.wallpaper'], 'switch before writing settings');
  assert.deepEqual(primary[1], ['group', 'Wallpaper/org.eyes.wallpaper/General']);
  const writes = primary.filter(call => call[0] === 'write');
  assert.deepEqual(writes.map(call => call[1]).sort(), [
    'Wallpaper/org.eyes.wallpaper/General:Color=#d8d2df',
    'Wallpaper/org.eyes.wallpaper/General:FillMode=2',
    'Wallpaper/org.eyes.wallpaper/General:Image=file:///home/user/.local/share/wallpapers/Package',
  ], 'the live Eyes wallpaper receives the original package URL');
  assert.ok(writes.every(call => call[2] === 'org.eyes.wallpaper'),
    'writeConfig also feeds the live wallpaper, so it may only run once Eyes is live');
  assert.deepEqual(desktops[2].calls, [['plugin', 'org.eyes.wallpaper']],
    'if Plasma did not switch, nothing may leak into the original wallpaper');
});

test('wallpaper restore writes the full origin back to config and the live desktop', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-restore-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  const state = join(root, 'state/eyes/wallpaper-origin.json');
  const calls = join(root, 'calls');
  const mocks = join(root, 'commands');
  mkdirSync(mocks);
  writeFileSync(config, `[Containments][7]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.eyes.wallpaper
[Containments][7][Wallpaper][org.eyes.wallpaper][General]
AnimationFps=60
Image=file:///pre-mount.jpg
[Containments][7][Wallpaper][org.kde.image][General]
Image=file:///pre-mount.jpg
Color=#112233
FillMode=1
[Containments][8]
formfactor=2
plugin=org.kde.panel
wallpaperplugin=org.kde.image
[Containments][8][Wallpaper][org.kde.image][General]
Image=file:///panel.jpg
`);
  mkdirSync(dirname(state), { recursive: true });
  writeFileSync(state, JSON.stringify({
    version: 1,
    containments: {
      '7': {
        plugin: 'org.kde.image',
        recovered: false,
        wallpaper: {
          'org.kde.image': {
            General: {
              Image: 'file:///pre-mount.jpg',
              Color: '#112233',
              FillMode: '1',
            },
          },
        },
      },
    },
  }));
  chmodSync(state, 0o600);
  writeFileSync(join(mocks, 'kwriteconfig6'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'kwriteconfig6'), 0o755);
  writeFileSync(join(mocks, 'qdbus6'),
    '#!/bin/sh\nprintf "qdbus6 %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'qdbus6'), 0o755);
  const output = execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', config,
    '--state-file', state, '--restore', '--activate-runtime', '--json',
  ], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${mocks}:${process.env.PATH}`,
        EYES_TEST_RECORD: calls },
  });
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const recorded = readFileSync(calls, 'utf8');
  assert.match(recorded, /--group org\.kde\.image --group General --key Image --notify file:\/\/\/pre-mount\.jpg/);
  assert.match(recorded, /--key Color --notify #112233/);
  assert.match(recorded, /--key FillMode --notify 1/);
  assert.match(recorded, /--key wallpaperplugin --notify org\.kde\.image/);
  assert.match(recorded, /qdbus6 .*org\.kde\.PlasmaShell\.evaluateScript/);
  assert.match(recorded, /"7":"org\.kde\.image"/);
  assert.doesNotMatch(recorded, /panel\.jpg|AnimationFps/);
  assert.equal(existsSync(state), false, 'a completed restore clears the origin state');
});

test('legacy recovery identifies the image hidden by a permanent Eyes mount', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-recovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  const state = join(root, 'state/eyes/wallpaper-origin.json');
  const calls = join(root, 'calls');
  const mocks = join(root, 'commands');
  mkdirSync(mocks);
  writeFileSync(config, `[Containments][9]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.eyes.wallpaper
[Containments][9][Wallpaper][org.eyes.wallpaper][General]
Image=file:///pre-mount.jpg
Color=#112233
FillMode=2
[Containments][9][Wallpaper][org.kde.image][General]
Image=file:///pre-mount.jpg
Color=#112233
FillMode=1
[Containments][9][Wallpaper][com.mio.Eyes][General]
Image=file:///older-eyes-copy.jpg
`);
  writeFileSync(join(mocks, 'kwriteconfig6'),
    '#!/bin/sh\nprintf "kwrite %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'kwriteconfig6'), 0o755);
  writeFileSync(join(mocks, 'qdbus6'),
    '#!/bin/sh\nprintf "qdbus %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'qdbus6'), 0o755);
  const result = JSON.parse(execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', config,
    '--state-file', state, '--restore', '--recover-legacy',
    '--activate-runtime', '--json',
  ], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${mocks}:${process.env.PATH}`,
      EYES_TEST_RECORD: calls },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.containments[0].plugin, 'org.kde.image');
  assert.equal(result.containments[0].recovered, true);
  const recorded = readFileSync(calls, 'utf8');
  assert.match(recorded, /--key wallpaperplugin --notify org\.kde\.image/);
  assert.doesNotMatch(recorded, /--notify com\.mio\.Eyes/);
  assert.equal(existsSync(state), false);
});

test('restore never overwrites a wallpaper chosen after Eyes was mounted', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-user-choice-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  const state = join(root, 'state/eyes/wallpaper-origin.json');
  writeFileSync(config, `[Containments][12]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.slideshow
[Containments][12][Wallpaper][org.kde.slideshow][General]
SlidePaths=file:///new-choice
`);
  mkdirSync(dirname(state), { recursive: true });
  writeFileSync(state, JSON.stringify({
    version: 1,
    containments: {
      '12': {
        plugin: 'org.kde.image',
        recovered: false,
        wallpaper: {
          'org.kde.image': { General: { Image: 'file:///old-origin.jpg' } },
        },
      },
    },
  }));
  const result = JSON.parse(execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', config,
    '--state-file', state, '--restore', '--json',
  ], { encoding: 'utf8' }));
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.actions, []);
  assert.equal(existsSync(state), false,
    'a changed user wallpaper makes the saved pre-mount origin obsolete');
});

test('wallpaper packages keep dynamic light/dark semantics and pure colors remain valid', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = join(root, 'data');
  const packagePath = join(data, 'wallpapers/Sample');
  const wallpaper = join(packagePath, 'contents/images/5120x2880.jpg');
  const darkWallpaper = join(packagePath, 'contents/images_dark/5120x2880.jpg');
  mkdirSync(dirname(wallpaper), { recursive: true });
  mkdirSync(dirname(darkWallpaper), { recursive: true });
  writeFileSync(wallpaper, 'fixture');
  writeFileSync(darkWallpaper, 'fixture');
  const packageConfig = join(root, 'package-config');
  writeFileSync(packageConfig, `[Containments][10]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][10][Wallpaper][org.kde.image][General]
Image=file://${packagePath}
`);
  const packageOutput = execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', packageConfig,
    '--state-file', join(root, 'package-state.json'),
    '--dry-run', '--json'], {
      encoding: 'utf8', env: { ...process.env, XDG_DATA_HOME: data },
    });
  const packageResult = JSON.parse(packageOutput);
  const imageAction = packageResult.actions.find(args => args.includes('Image'));
  assert.equal(imageAction.at(-1), `file://${packagePath}`);
  assert.doesNotMatch(packageOutput, /contents\/images(?:_dark)?\/5120x2880\.jpg/,
    'the package URL must be preserved so Plasma can follow the color scheme');

  const wallpaperQml = readFileSync(
    'packaging/plasma-wallpaper/org.eyes.wallpaper/contents/ui/main.qml', 'utf8');
  // The backdrop is resolved like Plasma's own image wallpaper: MediaProxy picks
  // the light or dark variant, and only day/night wallpapers use the snapshot.
  assert.match(wallpaperQml, /Wallpaper\.MediaProxy/);
  assert.match(wallpaperQml, /mediaProxy\.modelImage/);
  assert.match(wallpaperQml, /BackgroundType\.DayNight/);
  assert.match(wallpaperQml, /Wallpaper\.DayNightWallpaper/);
  assert.match(wallpaperQml, /wallpaperSnapshot\.bottom/);
  assert.match(wallpaperQml, /Wallpaper\.TransientImage/,
    'day/night image:// URLs require the Plasma image provider, not Qt Image');
  // Plasma paints the new wallpaper on a black screen, so the first frame must
  // already contain the picture: ordinary wallpapers load synchronously.
  assert.match(wallpaperQml, /id: wallpaperBottomImage[\s\S]*?asynchronous: false/);

  const colorConfig = join(root, 'color-config');
  writeFileSync(colorConfig, `[Containments][11]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.color
[Containments][11][Wallpaper][org.kde.color][General]
Color=#aabbcc
`);
  const colorOutput = execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', colorConfig,
    '--state-file', join(root, 'color-state.json'),
    '--dry-run', '--json'], { encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'] });
  const colorResult = JSON.parse(colorOutput);
  assert.ok(colorResult.actions.some(
    args => args.includes('Color') && args.includes('#aabbcc')));
});

test('resident Rive rendering reuses nodes and batches model inputs', () => {
  const scheduling = readFileSync('cmake/RiveScheduling.cmake', 'utf8');
  const rive = readFileSync('cmake/Rive.cmake', 'utf8');
  assert.match(rive, /CMAKE_CONFIGURE_DEPENDS[\s\S]*RiveScheduling\.cmake/,
    'CMake must regenerate adapted Rive sources when the patch script changes');
  assert.match(scheduling, /if \(m_viewportRect == viewportRect\)\\n        return;/);
  assert.match(scheduling, /!m_geometryData\.isEmpty\(\)[\s\S]*!m_clippingData\.isEmpty\(\)/,
    'Reused nodes must upload the current path even after a geometry shrink');
  assert.equal(
    (scheduling.match(/if \(m_oldBufferSize > m_geometryData\.size\(\)\)/g) || []).length,
    1,
    'The old shrink-only branch may remain only as the upstream match pattern');
  assert.match(scheduling, /Q_INVOKABLE void updateInputs\(const QVariantMap &values\)/);
  assert.match(scheduling, /m_inputValues\.contains\(it\.key\(\)\)/);
  const scene = readFileSync(
    'packaging/plasma-wallpaper/org.eyes.wallpaper/contents/ui/RiveEyeScene.qml',
    'utf8');
  assert.match(scene, /stateMachineInterface\.updateInputs\(values\)/);
  assert.doesNotMatch(scene, /property real \w+: scene\.inputs\./,
    'Rive inputs must be pushed as one batch rather than 150 QML bindings per frame');
});

test('desktop wallpaper is mounted only for visible cycles and restored on exit', () => {
  const source = readFileSync('desktop/main.cpp', 'utf8');
  assert.match(source, /class WallpaperController final/);
  assert.match(source, /&EyesService::shownChanged[\s\S]*request\(m_service->shown\(\)\)/);
  assert.match(source, /Operation::Mount[\s\S]*Operation::Restore/);
  assert.match(source, /--recover-legacy/);
  assert.match(source, /restoreBlocking\(\)/);
  assert.match(source, /quitRequested[\s\S]*restoreBlocking\(\)[\s\S]*QCoreApplication::quit/);
  assert.doesNotMatch(source, /QFileSystemWatcher/,
    'The host must not keep forcing Eyes back after the user selects a wallpaper');

  const client = readFileSync('bin/eyes', 'utf8');
  assert.match(client, /wait_for_desktop_shutdown\(\)/);
  assert.match(client,
    /if primary_command == "quit":[\s\S]*wait_for_desktop_shutdown\(\)/,
    'the command client must wait for the restoring host exit');
  assert.doesNotMatch(client,
    /if primary_command == "quit":\s*stop_desktop_service\(\)/,
    'systemd must not be stopped before the host restores the wallpaper');
});
