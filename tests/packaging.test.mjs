import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
    '#!/bin/sh\nprintf "kwrite %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'kwriteconfig6'), 0o755);
  writeFileSync(join(mocks, 'qdbus6'),
    '#!/bin/sh\nprintf "qdbus %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'qdbus6'), 0o755);
  const env = { ...process.env, PATH: `${mocks}:${process.env.PATH}`,
    EYES_TEST_RECORD: calls };
  const run = () => JSON.parse(execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', config,
    '--state-file', state, '--mount', '--activate-runtime', '--json',
  ], { encoding: 'utf8', env }));
  const result = run();
  const actions = result.actions.flat().join(' ');
  assert.equal(result.ok, true);
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
  assert.match(wallpaperQml, /Wallpaper\.DayNightWallpaper/);
  assert.match(wallpaperQml, /wallpaperSnapshot\.bottom/);
  assert.match(wallpaperQml, /Wallpaper\.TransientImage/,
    'package image:// URLs require the Plasma image provider, not Qt Image');

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
