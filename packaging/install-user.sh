#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_prefix="${EYES_INSTALL_PREFIX:-$HOME/.local}"
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
state_home="${XDG_STATE_HOME:-$HOME/.local/state}"
visibility_marker="$state_home/eyes/user-visibility"
build_dir="$project_root/build"

cmake -S "$project_root" -B "$build_dir" -G Ninja \
    -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build "$build_dir" -j2

wallpaper_ui="$install_prefix/share/plasma/wallpapers/org.eyes.wallpaper/contents/ui"
refresh_plasma=true
if [[ -f "$wallpaper_ui/main.qml" ]]; then
    refresh_plasma=false
    for item in main.qml EyeScene.qml RiveEyeScene.qml AnimationClock.qml; do
        if ! cmp -s "$project_root/packaging/plasma-wallpaper/org.eyes.wallpaper/contents/ui/$item" \
            "$wallpaper_ui/$item"; then
            refresh_plasma=true
        fi
    done
    if ! cmp -s "$build_dir/wallpaper-ui/eyes-core.js" "$wallpaper_ui/eyes-core.js" \
        || ! cmp -s "$build_dir/wallpaper-ui/eye.frag.qsb" "$wallpaper_ui/eye.frag.qsb" \
        || ! cmp -s "$build_dir/wallpaper-ui/eyes.riv" "$wallpaper_ui/eyes.riv" \
        || ! cmp -s "$build_dir/wallpaper-ui/EyesRive/libEyesRive.so" "$wallpaper_ui/EyesRive/libEyesRive.so"; then
        refresh_plasma=true
    fi
fi

# Stop both generations before replacing binaries or taking the bridge port.
source "$project_root/packaging/migrate-legacy-install.sh"
stop_legacy_install
if [[ -x "$install_prefix/bin/eyes" ]]; then
    "$install_prefix/bin/eyes" quit >/dev/null 2>&1 || true
fi
for _ in {1..20}; do
    if ! pgrep -u "$UID" -x eyes-desktop >/dev/null 2>&1; then
        break
    fi
    sleep 0.1
done
if pgrep -u "$UID" -x eyes-desktop >/dev/null 2>&1; then
    pkill -TERM -u "$UID" -x eyes-desktop 2>/dev/null || true
fi

cmake --install "$build_dir" --prefix "$install_prefix"

# Register Eyes as a normal application. The absolute executable path keeps
# the app menu entry working even when the graphical session omits
# ~/.local/bin from PATH.
application_dir="$install_prefix/share/applications"
application_entry="$application_dir/eyes-desktop.desktop"
mkdir -p "$application_dir"
cat >"$application_entry" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Eyes
GenericName=Agent Desktop Presence
Comment=在桌面上显示 Agent 工作状态
Comment[en]=Show agent activity through a pair of animated eyes
Exec="$install_prefix/bin/eyes" show
TryExec=$install_prefix/bin/eyes
Icon=eyes-desktop
Terminal=false
Categories=Utility;
Keywords=Eyes;Agent;AI;Codex;
StartupNotify=false
Actions=Hide;Quit;

[Desktop Action Hide]
Name=隐藏 Eyes
Exec="$install_prefix/bin/eyes" hide

[Desktop Action Quit]
Name=退出 Eyes
Exec="$install_prefix/bin/eyes" quit
EOF
chmod 0644 "$application_entry"

# User-level hooks stay available outside this checkout and apply to every
# Codex project. The installer preserves unrelated hook definitions.
python3 "$project_root/packaging/install-codex-hooks.py"

# Preserve each desktop's current image and move only the desktop
# containment to the Eyes wallpaper plugin. Plasma panels are ignored.
desktop_config="${XDG_CONFIG_HOME:-$HOME/.config}/plasma-org.kde.plasma.desktop-appletsrc"
python3 "$project_root/packaging/configure-plasma-wallpaper.py" \
    --config "$desktop_config"

# Startup is opt-in. Remove entries written by earlier releases so neither the
# session manager nor the user service can launch Eyes at login.
autostart_entry="$config_home/autostart/eyes-desktop-autostart.desktop"
rm -f "$autostart_entry"
legacy_autostart="$install_prefix/etc/xdg/autostart/eyes-desktop-autostart.desktop"
rm -f "$legacy_autostart"
rmdir "$install_prefix/etc/xdg/autostart" 2>/dev/null || true
rmdir "$install_prefix/etc/xdg" 2>/dev/null || true
rmdir "$install_prefix/etc" 2>/dev/null || true

desktop_exec="$install_prefix/bin/eyes-desktop"
systemd_dir="$config_home/systemd/user"
mkdir -p "$systemd_dir"
cat >"$systemd_dir/eyes-desktop.service" <<EOF
[Unit]
Description=Eyes desktop presence
After=plasma-plasmashell.service
PartOf=graphical-session.target
ConditionPathExists=!$visibility_marker

[Service]
Type=simple
ExecStart="$desktop_exec" --hidden
Restart=on-failure
RestartSec=1

[Install]
WantedBy=plasma-plasmashell.service
EOF
rm -f "$systemd_dir/plasma-plasmashell.service.wants/eyes-desktop.service"

if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    systemctl --user disable eyes-desktop.service >/dev/null 2>&1 || true
fi

if command -v kwriteconfig6 >/dev/null 2>&1; then
    kwriteconfig6 --file kwinrc --group Plugins \
        --key eyes-cursorEnabled true
fi

if command -v gdbus >/dev/null 2>&1 \
    && gdbus call --session --dest org.kde.KWin --object-path /KWin \
        --method org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1; then
    gdbus call --session --dest org.kde.KWin --object-path /KWin \
        --method org.kde.KWin.reconfigure >/dev/null 2>&1 || true
    script_path="$install_prefix/share/kwin/scripts/eyes-cursor/contents/code/main.js"
    loaded="$(gdbus call --session --dest org.kde.KWin --object-path /Scripting \
        --method org.kde.kwin.Scripting.isScriptLoaded \
        eyes-cursor 2>/dev/null || true)"
    if [[ "$loaded" != *"true"* ]]; then
        gdbus call --session --dest org.kde.KWin --object-path /Scripting \
            --method org.kde.kwin.Scripting.loadScript \
            "$script_path" eyes-cursor >/dev/null 2>&1 || true
        gdbus call --session --dest org.kde.KWin --object-path /Scripting \
            --method org.kde.kwin.Scripting.start >/dev/null 2>&1 || true
    fi
fi

image_script="desktops().forEach(function(d) { d.wallpaperPlugin = 'org.kde.image'; });"
eyes_script="desktops().forEach(function(d) { d.wallpaperPlugin = 'org.eyes.wallpaper'; });"
if command -v qdbus6 >/dev/null 2>&1 \
    && qdbus6 org.kde.plasmashell >/dev/null 2>&1; then
    qdbus6 org.kde.plasmashell /PlasmaShell \
        org.kde.PlasmaShell.evaluateScript "$image_script" \
        >/dev/null 2>&1 || true
    sleep 0.3
    qdbus6 org.kde.plasmashell /PlasmaShell \
        org.kde.PlasmaShell.evaluateScript "$eyes_script" \
        >/dev/null 2>&1 || true
    sleep 0.5
    # Switching wallpaper plugins does not clear QQmlEngine's component cache.
    if [[ "$refresh_plasma" == true ]]; then
        if systemctl --user is-active --quiet plasma-plasmashell.service; then
            systemctl --user restart plasma-plasmashell.service
        else
            printf '提示：绘制代码已更新，请重新登录以清除 Plasma 的旧组件缓存。\n'
        fi
    fi
else
    printf '提示：Plasma 当前未响应；壁纸插件将在下次登录时生效。\n'
fi

remove_legacy_install

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$install_prefix/share/applications" \
        >/dev/null 2>&1 || true
fi
if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 --noincremental >/dev/null 2>&1 || true
fi

printf 'Eyes 已安装到 %s\n' "$install_prefix"
printf 'Plasma 桌面壁纸层已切换到 Eyes；桌面图标与面板保持在上方。\n'
printf '运行 %s/bin/eyes show 显示双眼。\n' "$install_prefix"
