import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('wallpaper upgrade carries the active image into Eyes and leaves panels untouched', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-upgrade-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  writeFileSync(config, `[Containments][4]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=com.mio.Eyes
[Containments][4][Wallpaper][com.mio.Eyes][General]
Image=file:///test-wallpaper.jpg
[Containments][5]
formfactor=2
plugin=org.kde.panel
`);
  const output = execFileSync('python3', ['packaging/configure-plasma-wallpaper.py',
    '--config', config, '--dry-run', '--json'], { encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'] });
  const result = JSON.parse(output);
  const actions = result.actions.flat().join(' ');
  assert.match(actions, /--group Wallpaper --group org\.eyes\.wallpaper --group General --key Image --notify file:\/\/\/test-wallpaper\.jpg/);
  assert.match(actions, /--key wallpaperplugin --notify org\.eyes\.wallpaper/);
  assert.doesNotMatch(actions, /--group 5/);
  assert.deepEqual(result.containments.map(item => item.id), ['4']);
});

test('wallpaper changes are carried into Eyes without overwriting panel or animation settings', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-switch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  const calls = join(root, 'calls');
  const mocks = join(root, 'commands');
  mkdirSync(mocks);
  writeFileSync(config, `[Containments][7]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][7][Wallpaper][org.eyes.wallpaper][General]
AnimationFps=30
Image=file:///old.jpg
Color=#000000
FillMode=3
[Containments][7][Wallpaper][org.kde.image][General]
Image=file:///new.jpg
Color=#ffffff
FillMode=1
[Containments][8]
formfactor=2
plugin=org.kde.panel
wallpaperplugin=org.kde.image
[Containments][8][Wallpaper][org.kde.image][General]
Image=file:///panel.jpg
`);
  writeFileSync(join(mocks, 'kwriteconfig6'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'kwriteconfig6'), 0o755);
  writeFileSync(join(mocks, 'qdbus6'),
    '#!/bin/sh\nprintf "qdbus6 %s\\n" "$*" >> "$EYES_TEST_RECORD"\n', { mode: 0o755 });
  chmodSync(join(mocks, 'qdbus6'), 0o755);
  const output = execFileSync('python3', ['packaging/configure-plasma-wallpaper.py',
    '--config', config, '--json', '--activate-runtime'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${mocks}:${process.env.PATH}`,
        EYES_TEST_RECORD: calls },
    });
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.pending, []);
  const recorded = readFileSync(calls, 'utf8');
  assert.match(recorded, /--key Image --notify file:\/\/\/new\.jpg/);
  assert.match(recorded, /--key Color --notify #ffffff/);
  assert.match(recorded, /--key FillMode --notify 1/);
  assert.match(recorded, /--key wallpaperplugin --notify org\.eyes\.wallpaper/);
  assert.match(recorded, /qdbus6 .*org\.kde\.PlasmaShell\.evaluateScript .*org\.eyes\.wallpaper/);
  assert.doesNotMatch(recorded, /panel\.jpg|AnimationFps/);
});

test('wallpaper guard is idempotent after the active image is mounted', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-idempotent-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'desktop-config');
  writeFileSync(config, `[Containments][9]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.eyes.wallpaper
[Containments][9][Wallpaper][org.eyes.wallpaper][General]
AnimationFps=30
Image=file:///wallpaper.jpg
Color=#123456
FillMode=2
`);
  const output = execFileSync('python3', ['packaging/configure-plasma-wallpaper.py',
    '--config', config, '--dry-run', '--json'], { encoding: 'utf8' });
  for (const line of output.trim().split('\n')) {
    if (!line.startsWith('{"ok"')) continue;
    const result = JSON.parse(line);
    assert.equal(result.ok, true);
    assert.equal(result.changed, false);
    assert.deepEqual(result.actions, []);
  }
});

test('wallpaper packages resolve to a concrete image and pure colors remain valid', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eyes-wallpaper-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = join(root, 'data');
  const wallpaper = join(data, 'wallpapers/Sample/contents/images/5120x2880.jpg');
  mkdirSync(dirname(wallpaper), { recursive: true });
  writeFileSync(wallpaper, 'fixture');
  const packageConfig = join(root, 'package-config');
  writeFileSync(packageConfig, `[Containments][10]
formfactor=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
[Containments][10][Wallpaper][org.kde.image][General]
Image=file://${join(data, 'wallpapers/Sample')}
`);
  const packageOutput = execFileSync('python3', [
    'packaging/configure-plasma-wallpaper.py', '--config', packageConfig,
    '--dry-run', '--json'], {
      encoding: 'utf8', env: { ...process.env, XDG_DATA_HOME: data },
    });
  assert.match(packageOutput, /5120x2880\.jpg/);

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
    '--dry-run', '--json'], { encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'] });
  const colorResult = JSON.parse(colorOutput);
  assert.ok(colorResult.actions.some(
    args => args.includes('Color') && args.includes('#aabbcc')));
});
