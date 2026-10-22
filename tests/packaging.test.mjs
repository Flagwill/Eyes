import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
    '--config', config, '--dry-run'], { encoding: 'utf8' });
  assert.match(output, /--group Wallpaper --group org\.eyes\.wallpaper --group General --key Image --notify file:\/\/\/test-wallpaper\.jpg/);
  assert.match(output, /--key wallpaperplugin --notify org\.eyes\.wallpaper/);
  assert.doesNotMatch(output, /--group 5/);
  assert.match(output, /configured desktop containments: 4/);
});
