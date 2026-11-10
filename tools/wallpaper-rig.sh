#!/usr/bin/env bash
# wallpaper-rig.sh — 隔离的嵌套 Plasma 会话，用于验证壁纸挂载/恢复。
#
# 为什么需要它：AGENTS.md 要求修改挂载流程后须在隔离的嵌套 Plasma 会话中验证，
# 因为 plasmashell 持有自己的配置副本，mock 复现不了真实行为。但仓库里的
# desktop:wallpaper:test 只覆盖宿主状态机（把挂载脚本换成 mock），不碰真实 Plasma。
#
# 这个 rig 有三条硬性约束，都是踩过坑换来的：
#   1. 自己启动并管理虚拟 KWin、plasmashell 与 D-Bus 的生命周期。任何退出路径都
#      必须把它们收干净，绝不允许把孤儿进程留给用户会话。
#   2. 截图循环必须有间隔和连续失败上限。截图失败说明会话已经死了，此时应当
#      退出并报错，而不是继续重试。
#   3. 正常结束、失败、Ctrl-C、被 kill 都走同一个 cleanup。一次中断如果绕过
#      cleanup，就会在系统里留下一个无人看管的无限循环。
#
# 用法：
#   tools/wallpaper-rig.sh [--cycles N] [--capture-dir DIR]
#                          [--capture-interval SECONDS] [--max-failures N]
#                          [--settle SECONDS] [--keep] [--help]

set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# exec 进 dbus 会话时要用原始参数，不能用被 shift 过的 "$@"。
original_args=("$@")

cycles=1
capture_dir=""
capture_interval=1.0
max_failures=3
settle=4
keep_runtime=0

usage() {
  sed -n '3,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cycles) cycles="$2"; shift 2 ;;
    --capture-dir) capture_dir="$2"; shift 2 ;;
    --capture-interval) capture_interval="$2"; shift 2 ;;
    --max-failures) max_failures="$2"; shift 2 ;;
    --settle) settle="$2"; shift 2 ;;
    --keep) keep_runtime=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for value in "$cycles" "$max_failures"; do
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || { echo "次数参数必须为正整数: $value" >&2; exit 2; }
done

# 自己拉 D-Bus，而不是用 dbus-run-session：后者把 dbus-daemon 的日志直连终端和
# journald，rig 里那些无害的激活失败会变成刷屏。
if [[ -z "${EYES_RIG_IN_DBUS:-}" ]]; then
  export EYES_RIG_IN_DBUS=1
  outer_dir="$(mktemp -d "${TMPDIR:-/tmp}/eyes-rig-dbus.XXXXXX")"
  exec 3> "$outer_dir/dbus.pid"
  dbus_address="$(dbus-daemon --session --fork --print-address=1 --print-pid=3 \
    2> "$outer_dir/dbus.log")"
  exec 3>&-
  export EYES_RIG_DBUS_ADDRESS="$dbus_address"
  export EYES_RIG_DBUS_PID="$(cat "$outer_dir/dbus.pid")"
  export EYES_RIG_DBUS_DIR="$outer_dir"
  exec "$0" "${original_args[@]}"
fi

export DBUS_SESSION_BUS_ADDRESS="$EYES_RIG_DBUS_ADDRESS"

runtime_root="$(mktemp -d "${TMPDIR:-/tmp}/eyes-wallpaper-rig.XXXXXX")"
export XDG_RUNTIME_DIR="$runtime_root/run"
export XDG_CONFIG_HOME="$runtime_root/config"
export XDG_DATA_HOME="$runtime_root/data"
export XDG_CACHE_HOME="$runtime_root/cache"
export XDG_STATE_HOME="$runtime_root/state"
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" \
  "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
chmod 700 "$XDG_RUNTIME_DIR"

# 截图必须落在运行时目录之外，否则 cleanup 会把它一起删掉。
if [[ -z "$capture_dir" ]]; then
  capture_dir="$HOME/.cache/eyes-wallpaper-rig/captures"
fi
mkdir -p "$capture_dir"
capture_dir="$(cd "$capture_dir" && pwd)"
capture_stamp="$(date +%Y%m%d-%H%M%S)"

# socket 名带 pid：cleanup 要靠命令行认领残留进程，名字必须足够独特，
# 否则会误杀命令行里偶然提到这个 socket 的无关进程。
socket_name="eyes-rig-wl-$$"
export WAYLAND_DISPLAY="$socket_name"
export QT_QPA_PLATFORM=wayland
export QT_FORCE_STDERR_LOGGING=1 QT_LOGGING_TO_CONSOLE=1
export KDE_FULL_SESSION=true XDG_CURRENT_DESKTOP=KDE
export XDG_DATA_DIRS="$runtime_root/prefix/share:/usr/local/share:/usr/share"

# 每个后台任务都继承 EYES_RIG_ROOT，cleanup 靠它认领整棵进程树。
export EYES_RIG_ROOT="$runtime_root"

child_pids=()

log() { printf '[rig %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# 按进程树收：plasmashell 之类会 fork 出子进程，只杀父 pid 会留下孤儿。
kill_tree() {
  local pid="$1"
  [[ -d "/proc/$pid" ]] || return 0
  local kids kid
  kids="$(pgrep -P "$pid" 2>/dev/null || true)"
  for kid in $kids; do kill_tree "$kid"; done
  kill -TERM "$pid" 2>/dev/null || true
}

# 按环境变量认领：本 rig 的进程命令行里没有运行时目录路径
# （plasmashell 的 argv 是 "plasmashell --no-respawn"），只有环境变量可靠。
kill_by_env() {
  local pid env
  for pid in /proc/[0-9]*; do
    pid="${pid#/proc/}"
    [[ "$pid" == "$$" ]] && continue
    env="$( { tr '\0' '\n' < "/proc/$pid/environ"; } 2>/dev/null )" || continue
    [[ "$env" == *"EYES_RIG_ROOT=$runtime_root"* ]] || continue
    kill -TERM "$pid" 2>/dev/null || true
  done
}

# 按命令行匹配兜底：kwin_wayland 会禁用 dumpable，/proc/<pid>/environ 读不到，
# 只能靠命令行里带的 socket 名认领。
kill_by_cmdline() {
  local pattern="$1" pid cmd
  for pid in /proc/[0-9]*; do
    pid="${pid#/proc/}"
    [[ "$pid" == "$$" ]] && continue
    cmd="$( { tr '\0' ' ' < "/proc/$pid/cmdline"; } 2>/dev/null )" || continue
    [[ -z "$cmd" ]] && continue
    [[ "$cmd" == *"$pattern"* ]] || continue
    kill -TERM "$pid" 2>/dev/null || true
  done
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  for pid in ${child_pids[@]+"${child_pids[@]}"}; do kill_tree "$pid"; done
  kill_by_env
  sleep 0.5
  for pid in ${child_pids[@]+"${child_pids[@]}"}; do kill -KILL "$pid" 2>/dev/null || true; done
  kill_by_env
  sleep 0.3
  kill_by_env
  # 兜底：按命令行认领仍带本 rig socket 名的残留。
  kill_by_cmdline "--socket $socket_name"
  sleep 0.3
  kill_by_cmdline "--socket $socket_name"
  if [[ -n "${EYES_RIG_DBUS_PID:-}" ]]; then
    kill -TERM "$EYES_RIG_DBUS_PID" 2>/dev/null || true
  fi
  if [[ -n "${EYES_RIG_DBUS_DIR:-}" ]]; then
    rm -rf "$EYES_RIG_DBUS_DIR"
  fi
  if [[ $keep_runtime -eq 1 ]]; then
    log "保留运行时目录: $runtime_root"
  else
    rm -rf "$runtime_root"
  fi
  exit $status
}
trap cleanup EXIT INT TERM

# start_group 必须直接调用，不能包在 $(...) 里：命令替换会开子 shell，
# 数组追加只作用于子 shell 的副本，父进程拿不到 pid，cleanup 就收不干净。
started_pid=""
start_group() {
  local name="$1"; shift
  "$@" > "$runtime_root/$name.log" 2>&1 &
  started_pid=$!
  child_pids+=("$started_pid")
}

# 等待某个条件成立，最多 timeout 秒。条件失败返回非零而不是死等。
wait_for() {
  local timeout="$1" description="$2"; shift 2
  local deadline=$(( SECONDS + timeout ))
  while (( SECONDS < deadline )); do
    if "$@"; then return 0; fi
    sleep 0.25
  done
  log "等待超时: $description"
  return 1
}

# 有界等待日志里出现某个模式（最多 timeout 秒）。用来等插件真正渲染完成，
# 而不是靠 sleep 猜时间。
wait_for_log() {
  local timeout="$1" pattern="$2" file="$3"
  local deadline=$(( SECONDS + timeout ))
  while (( SECONDS < deadline )); do
    grep -qF -- "$pattern" "$file" 2>/dev/null && return 0
    sleep 0.5
  done
  return 1
}

socket_exists() { [[ -S "$XDG_RUNTIME_DIR/$socket_name" ]]; }

activity_manager_ready() {
  busctl --address="$DBUS_SESSION_BUS_ADDRESS" list 2>/dev/null \
    | grep -q '^org.kde.ActivityManager'
}

portal_ready() {
  busctl --address="$DBUS_SESSION_BUS_ADDRESS" list 2>/dev/null \
    | grep -q 'org.freedesktop.portal.Desktop'
}

# 有界截图。会话死了就报错退出，不做无限重试。
capture() {
  local out="$1"
  local failures=0
  while (( failures < max_failures )); do
    if timeout 20 spectacle -b -n -f -o "$out" \
        >> "$runtime_root/spectacle.log" 2>&1 && [[ -s "$out" ]]; then
      return 0
    fi
    failures=$(( failures + 1 ))
    log "截图失败 ($failures/$max_failures): $out"
    log "spectacle 日志尾部: $(tail -n 3 "$runtime_root/spectacle.log" 2>/dev/null | tr '\n' ' | ')"
    (( failures < max_failures )) && sleep "$capture_interval"
  done
  return 1
}

# 把 Eyes 壁纸包装进隔离的 XDG_DATA_HOME，让 Plasma 能找到 org.eyes.wallpaper。
# 优先用 build 产物（验证当前源码），回退到已安装的包（验证当前发布状态）。
install_wallpaper_package() {
  local dest="$XDG_DATA_HOME/plasma/wallpapers/org.eyes.wallpaper"
  local source_pkg="$project_root/packaging/plasma-wallpaper/org.eyes.wallpaper"
  mkdir -p "$dest/contents/ui"
  if [[ -d "$source_pkg/contents" ]]; then
    cp -r "$source_pkg/contents/." "$dest/contents/"
    cp "$source_pkg/metadata.json" "$dest/metadata.json"
  fi
  if [[ -d "$project_root/build/wallpaper-ui" ]]; then
    cp -r "$project_root/build/wallpaper-ui/." "$dest/contents/ui/"
  elif [[ -d "$HOME/.local/share/plasma/wallpapers/org.eyes.wallpaper/contents/ui" ]]; then
    cp -r "$HOME/.local/share/plasma/wallpapers/org.eyes.wallpaper/contents/ui/." \
      "$dest/contents/ui/"
  else
    log "找不到壁纸包资源，请先运行 npm run desktop:build"
    return 1
  fi
  [[ -f "$dest/contents/ui/main.qml" ]]
}

# 最小 Plasma 配置：缺 kdeglobals 时 plasmashell 会直接 abort。
# 桌面配置由 plasmashell 自己生成；它没生成时补一份最小可用的，
# 否则挂载脚本会报 "Plasma desktop config not found"。
write_plasma_config() {
  cat > "$XDG_CONFIG_HOME/kdeglobals" <<'EOF'
[General]
ColorScheme=BreezeLight

[KDE]
LookAndFeelPackage=org.kde.breeze.desktop
EOF
  # 嵌套会话里 kscreensaver 会自行锁屏，锁屏界面会遮住整个桌面，
  # 截图就只剩一个模糊的登录框，看不到壁纸。
  cat > "$XDG_CONFIG_HOME/kscreenlockerrc" <<'EOF'
[Daemon]
Autolock=false
LockOnResume=false
EOF
}

# 锁屏若仍被拉起，就把它收掉：截图必须看到桌面本身。
kill_lockscreen() {
  local pid
  for pid in $(pgrep -f kscreenlocker_greet 2>/dev/null); do
    kill -KILL "$pid" 2>/dev/null || true
  done
}

write_desktop_config() {
  local image=""
  local candidate
  for candidate in /usr/share/wallpapers/*/contents/lockscreen/*.png \
      /usr/share/backgrounds/*.jpg /usr/share/backgrounds/*.png; do
    if [[ -f "$candidate" ]]; then image="file://$candidate"; break; fi
  done
  [[ -n "$image" ]] || image="file:///usr/share/backgrounds/default.jpg"
  cat > "$XDG_CONFIG_HOME/plasma-org.kde.plasma.desktop-appletsrc" <<EOF
[Containments][1]
activityId=
formfactor=0
immutability=1
lastScreen=0
location=0
plugin=org.kde.plasma.folder
wallpaperplugin=org.kde.image
wallpaperconfig=Desktop Folder

[Containments][1][Wallpaper][org.kde.image][General]
FillMode=1
Image=$image
EOF
}

wallpaper_call() {
  local mode="$1"
  # 加超时：qdbus6 会一直等 plasmashell 回应，桌面卡住时不能把 rig 挂死在这里。
  timeout 60 python3 "$project_root/packaging/configure-plasma-wallpaper.py" \
    --config "$XDG_CONFIG_HOME/plasma-org.kde.plasma.desktop-appletsrc" \
    --state-file "$XDG_STATE_HOME/eyes/wallpaper-origin.json" \
    --json --activate-runtime "--$mode"
}

# 把桌面壁纸显式设成一张确定的系统壁纸，好让基线可复现：
# 默认情况下 org.kde.image 的 Image 为空，Plasma 会退回自带默认壁纸，
# 那样基线/挂载/恢复三张图容易看起来一模一样，看不出挂载到底有没有生效。
set_baseline_wallpaper() {
  local image="file:///usr/share/wallpapers/Air/contents/images/1440x2960.png"
  [[ -f "${image#file://}" ]] || { log "找不到基线壁纸 $image"; return 1; }
  qdbus6 org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript \
    "const img='$image';desktops().forEach(function(d){d.wallpaperPlugin='org.kde.image';d.currentConfigGroup=['Wallpaper','org.kde.image','General'];d.writeConfig('Image',img);d.writeConfig('FillMode','1');});" \
    >/dev/null 2>&1
  sleep 3
}

# 自动校验：挂载后画面必须变，恢复后必须回到基线。
verify_cycle() {
  local rc=0
  python3 - "$1" "$2" "$3" <<'PY' || rc=$?
import sys
try:
    from PIL import Image, ImageChops
except Exception:
    sys.exit(1)

def diff_ratio(a, b):
    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB")
    diff = ImageChops.difference(ia, ib).convert("L")
    return sum(diff.histogram()[1:]) / float(ia.width * ia.height)

mounted = diff_ratio(sys.argv[1], sys.argv[2])
restored = diff_ratio(sys.argv[1], sys.argv[3])
print("[rig] 校验: 基线vs挂载 %.2f%%, 基线vs恢复 %.2f%%" % (mounted * 100, restored * 100))
if mounted < 0.01:
    print("[rig] 校验失败: 挂载后画面没有变化")
    sys.exit(2)
if restored > 0.01:
    print("[rig] 校验失败: 恢复后画面没有回到基线")
    sys.exit(2)
PY
  if [[ $rc -eq 2 ]]; then return 1; fi
  if [[ $rc -eq 1 ]]; then log "跳过自动校验（缺 Pillow）"; fi
  return 0
}

log "运行时目录: $runtime_root"
log "截图目录: $capture_dir"
write_plasma_config
install_wallpaper_package || exit 1

# --virtual 渲染到虚拟帧缓冲区，不与用户会话争用 DRM master。
# --no-lockscreen 必需：嵌套会话没有 session manager，KWin 会以锁定模式启动，
# 自己拉起 kscreenlocker_greet，锁屏界面会盖住整个桌面，截图就看不到壁纸。
start_group kwin kwin_wayland --virtual --no-lockscreen --socket "$socket_name"
kwin_pid="$started_pid"
wait_for 20 "Wayland socket $socket_name" socket_exists || exit 1
log "嵌套 KWin 就绪 (pid $kwin_pid)"

# kactivitymanagerd 必须显式拉起：它的 D-Bus 激活文件指向 systemd 用户单元，
# 而独立 D-Bus 会话上没有 systemd1，激活必然失败；
# 缺了它 plasmashell 会直接 abort（"The activity manager daemon is not running"）。
start_group kactivitymanagerd /usr/lib/kactivitymanagerd
wait_for 15 "org.kde.ActivityManager" activity_manager_ready || exit 1
log "kactivitymanagerd 就绪"

start_group plasmashell plasmashell --no-respawn
plasmashell_pid="$started_pid"
sleep 1
if ! kill -0 "$plasmashell_pid" 2>/dev/null; then
  log "plasmashell 启动失败，见 $runtime_root/plasmashell.log"
  exit 1
fi
log "plasmashell 就绪 (pid $plasmashell_pid)，等待桌面渲染 ${settle}s"
sleep "$settle"

# xdg-desktop-portal-kde：screenshot portal 的后端。独立 D-Bus 会话里
# systemd 激活不可用，必须手动拉起，否则走 portal 的截图请求会一直等。
if [[ -x /usr/lib/xdg-desktop-portal-kde ]]; then
  start_group portal /usr/lib/xdg-desktop-portal-kde
  if wait_for 10 "org.freedesktop.portal.Desktop" portal_ready; then
    log "xdg-desktop-portal-kde 就绪 (pid $started_pid)"
  else
    log "xdg-desktop-portal-kde 未就绪，截图可能走 portal 时会失败"
  fi
fi

# plasmashell 正常时会自己写出桌面布局配置；它没写出来就补一份最小的。
desktop_config="$XDG_CONFIG_HOME/plasma-org.kde.plasma.desktop-appletsrc"
if [[ ! -f "$desktop_config" ]]; then
  log "plasmashell 未生成桌面布局配置，写入最小配置"
  write_desktop_config
fi

for cycle in $(seq 1 "$cycles"); do
  log "=== 循环 $cycle/$cycles：基线（挂载前）==="
  set_baseline_wallpaper || { log "设置基线壁纸失败"; exit 1; }
  capture "$capture_dir/$capture_stamp-cycle${cycle}-baseline.png" || {
    log "截图失败：会话可能已经死亡，终止 rig"
    exit 1
  }

  log "=== 循环 $cycle/$cycles：挂载 ==="
  wallpaper_call mount || { log "挂载失败"; exit 1; }
  # 等壁纸插件真的加载并渲染出来，而不是靠 sleep 猜时间。
  if wait_for_log 30 "Eyes GPU wallpaper loaded" "$runtime_root/plasmashell.log"; then
    log "壁纸插件已加载"
  else
    log "等待壁纸加载证据超时，截图可能拍不到新壁纸"
  fi
  sleep 2
  kill_lockscreen
  sleep 1
  capture "$capture_dir/$capture_stamp-cycle${cycle}-mounted.png" || {
    log "截图失败：会话可能已经死亡，终止 rig"
    exit 1
  }

  log "=== 循环 $cycle/$cycles：恢复 ==="
  wallpaper_call restore || { log "恢复失败"; exit 1; }
  # 恢复要等 org.kde.image 真正加载完图片才看得出来，比挂载多等一会儿。
  sleep $(( settle * 2 ))
  kill_lockscreen
  sleep 1
  capture "$capture_dir/$capture_stamp-cycle${cycle}-restored.png" || {
    log "截图失败：会话可能已经死亡，终止 rig"
    exit 1
  }
  verify_cycle \
    "$capture_dir/$capture_stamp-cycle${cycle}-baseline.png" \
    "$capture_dir/$capture_stamp-cycle${cycle}-mounted.png" \
    "$capture_dir/$capture_stamp-cycle${cycle}-restored.png" || {
    log "校验未通过，终止 rig"
    exit 1
  }
done

log "完成，截图在 $capture_dir"
