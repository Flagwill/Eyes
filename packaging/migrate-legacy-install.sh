#!/usr/bin/env bash
# The previous installation names exist only here, to remove them on upgrade.

stop_legacy_install() {
    if [[ -x "$install_prefix/bin/mio" ]]; then
        "$install_prefix/bin/mio" quit >/dev/null 2>&1 || true
    fi
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user stop mio-desktop.service >/dev/null 2>&1 || true
    fi
    if pgrep -u "$UID" -x mio-desktop >/dev/null 2>&1; then
        pkill -TERM -u "$UID" -x mio-desktop 2>/dev/null || true
    fi
    for _ in {1..20}; do
        if ! pgrep -u "$UID" -x mio-desktop >/dev/null 2>&1; then
            break
        fi
        sleep 0.1
    done
    if pgrep -u "$UID" -x mio-desktop >/dev/null 2>&1; then
        printf 'Eyes：旧后台仍在退出，请稍后重新安装。\n' >&2
        return 1
    fi
    if command -v kwriteconfig6 >/dev/null 2>&1; then
        kwriteconfig6 --file kwinrc --group Plugins \
            --key mio-eyes-cursorEnabled false
    fi
    if command -v gdbus >/dev/null 2>&1; then
        gdbus call --session --dest org.kde.KWin --object-path /Scripting \
            --method org.kde.kwin.Scripting.unloadScript \
            mio-eyes-cursor >/dev/null 2>&1 || true
    fi
}

remove_legacy_install() {
    rm -f "$install_prefix/bin/mio" "$install_prefix/bin/mio-desktop" \
        "$config_home/autostart/mio-desktop-autostart.desktop" \
        "$install_prefix/etc/xdg/autostart/mio-desktop-autostart.desktop" \
        "$install_prefix/share/applications/mio-desktop.desktop" \
        "$install_prefix/share/applications/kwin-mio-eyes-cursor.desktop" \
        "$install_prefix/share/icons/hicolor/scalable/apps/mio-desktop.svg"
    # Only application code is removed; wallpaper images and user data stay put.
    rm -rf "$install_prefix/share/kwin/scripts/mio-eyes-cursor" \
        "$install_prefix/share/plasma/wallpapers/com.mio.Eyes"
}
