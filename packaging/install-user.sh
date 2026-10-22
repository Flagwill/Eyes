#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_prefix="${MIO_INSTALL_PREFIX:-$HOME/.local}"
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
build_dir="$project_root/build"

cmake -S "$project_root" -B "$build_dir" -G Ninja \
    -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build "$build_dir" -j2

wallpaper_ui="$install_prefix/share/plasma/wallpapers/com.mio.Eyes/contents/ui"
refresh_plasma=false
if [[ -f "$wallpaper_ui/main.qml" ]]; then
    for item in main.qml EyeScene.qml; do
        if ! cmp -s "$project_root/packaging/plasma-wallpaper/com.mio.Eyes/contents/ui/$item" \
            "$wallpaper_ui/$item"; then
            refresh_plasma=true
        fi
    done
    if ! cmp -s "$project_root/eyes-core.js" "$wallpaper_ui/eyes-core.js" \
        || ! cmp -s "$build_dir/wallpaper-ui/eye.frag.qsb" "$wallpaper_ui/eye.frag.qsb"; then
        refresh_plasma=true
    fi
fi
cmake --install "$build_dir" --prefix "$install_prefix"

# The old desktop host used a background window that could cover desktop icons.
# Stop it before Plasma switches to the wallpaper plugin.
if [[ -x "$install_prefix/bin/mio" ]]; then
    "$install_prefix/bin/mio" quit >/dev/null 2>&1 || true
fi
for _ in {1..20}; do
    if ! pgrep -u "$UID" -x mio-desktop >/dev/null 2>&1; then
        break
    fi
    sleep 0.1
done
if pgrep -u "$UID" -x mio-desktop >/dev/null 2>&1; then
    pkill -TERM -u "$UID" -x mio-desktop 2>/dev/null || true
fi

# Preserve each desktop's current image and move only the desktop
# containment to the MIO wallpaper plugin. Plasma panels are ignored.
desktop_config="${XDG_CONFIG_HOME:-$HOME/.config}/plasma-org.kde.plasma.desktop-appletsrc"
python3 "$project_root/packaging/configure-plasma-wallpaper.py" \
    --config "$desktop_config"

# Older releases installed the same autostart file under the user prefix.
# Keep only the XDG autostart entry below so sessions cannot launch MIO twice.
legacy_autostart="$install_prefix/etc/xdg/autostart/mio-desktop-autostart.desktop"
rm -f "$legacy_autostart"
rmdir "$install_prefix/etc/xdg/autostart" 2>/dev/null || true
rmdir "$install_prefix/etc/xdg" 2>/dev/null || true
rmdir "$install_prefix/etc" 2>/dev/null || true

mkdir -p "$config_home/autostart"
desktop_exec="$install_prefix/bin/mio-desktop"
cat >"$config_home/autostart/mio-desktop-autostart.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=MIO Agent 双眼
Comment=登录后等待 Agent 工作状态
Exec="$desktop_exec" --hidden
Icon=mio-desktop
Terminal=false
X-KDE-autostart-after=panel
StartupNotify=false
EOF

if command -v kwriteconfig6 >/dev/null 2>&1; then
    kwriteconfig6 --file kwinrc --group Plugins \
        --key mio-eyes-cursorEnabled true
fi

if command -v gdbus >/dev/null 2>&1 \
    && gdbus call --session --dest org.kde.KWin --object-path /KWin \
        --method org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1; then
    gdbus call --session --dest org.kde.KWin --object-path /KWin \
        --method org.kde.KWin.reconfigure >/dev/null 2>&1 || true
    script_path="$install_prefix/share/kwin/scripts/mio-eyes-cursor/contents/code/main.js"
    loaded="$(gdbus call --session --dest org.kde.KWin --object-path /Scripting \
        --method org.kde.kwin.Scripting.isScriptLoaded \
        mio-eyes-cursor 2>/dev/null || true)"
    if [[ "$loaded" != *"true"* ]]; then
        gdbus call --session --dest org.kde.KWin --object-path /Scripting \
            --method org.kde.kwin.Scripting.loadScript \
            "$script_path" mio-eyes-cursor >/dev/null 2>&1 || true
        gdbus call --session --dest org.kde.KWin --object-path /Scripting \
            --method org.kde.kwin.Scripting.start >/dev/null 2>&1 || true
    fi
fi

image_script="desktops().forEach(function(d) { d.wallpaperPlugin = 'org.kde.image'; });"
mio_script="desktops().forEach(function(d) { d.wallpaperPlugin = 'com.mio.Eyes'; });"
if command -v qdbus6 >/dev/null 2>&1 \
    && qdbus6 org.kde.plasmashell >/dev/null 2>&1; then
    qdbus6 org.kde.plasmashell /PlasmaShell \
        org.kde.PlasmaShell.evaluateScript "$image_script" \
        >/dev/null 2>&1 || true
    sleep 0.3
    qdbus6 org.kde.plasmashell /PlasmaShell \
        org.kde.PlasmaShell.evaluateScript "$mio_script" \
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

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$install_prefix/share/applications" \
        >/dev/null 2>&1 || true
fi

if ! "$install_prefix/bin/mio" status >/dev/null 2>&1; then
    "$install_prefix/bin/mio" host-start >/dev/null
fi

printf 'MIO 已安装到 %s\n' "$install_prefix"
printf 'Plasma 桌面壁纸层已切换到 MIO；桌面图标与面板保持在上方。\n'
printf '运行 %s/bin/mio show 显示双眼。\n' "$install_prefix"
