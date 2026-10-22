#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_prefix="${MIO_INSTALL_PREFIX:-$HOME/.local}"
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
build_dir="$project_root/build"

cmake -S "$project_root" -B "$build_dir" -G Ninja \
    -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build "$build_dir" -j2
cmake --install "$build_dir" --prefix "$install_prefix"

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

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$install_prefix/share/applications" \
        >/dev/null 2>&1 || true
fi

if ! "$install_prefix/bin/mio" status >/dev/null 2>&1; then
    log_dir="${XDG_CACHE_HOME:-$HOME/.cache}/mio-eyes"
    mkdir -p "$log_dir"
    nohup "$desktop_exec" --hidden \
        >>"$log_dir/desktop.log" 2>&1 &
fi

printf 'MIO 已安装到 %s\n' "$install_prefix"
printf '运行 %s/bin/mio show 显示双眼。\n' "$install_prefix"
