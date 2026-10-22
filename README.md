# MIO · Agent 双眼

MIO 是 Agent harness 的桌面存在层。Agent 工作时，它在壁纸上方铺一层半透明磨砂玻璃，用一双紫色抽象眼睛表达好奇、思考、专注、等待和完成。动画由连续的弹簧参数驱动，支持自动眨眼、八方向视线、系统光标跟随和基础情绪。

![MIO 全屏构图](docs/gallery/preview-fullscreen.jpg)

桌面版使用 Qt Quick + WebEngine，把同一套 Canvas 动画放到 KDE Plasma Wayland 的背景层。背景层只遮住壁纸，桌面图标、面板和普通应用窗口仍在它上方；窗口完全穿透键盘与鼠标输入，不抢占焦点。浏览器调试台保留为视觉和交互开发入口。

## 快速开始

浏览器调试台只需要 Node.js 和 Python 3：

```bash
npm run dev
```

打开 <http://127.0.0.1:5173/>。静态服务只监听本机回环地址。

KDE 桌面版需要 Plasma 6 Wayland、CMake、Ninja，以及 Qt 6 Base / Declarative / WebEngine、LayerShellQt 和 KF6WindowSystem。Arch Linux 可使用：

```bash
sudo pacman -S --needed cmake ninja qt6-base qt6-declarative \
  qt6-webengine layer-shell-qt kwindowsystem plasma-workspace
```

只构建桌面宿主：

```bash
npm run desktop:build
```

安装到用户目录并启用登录自启动：

```bash
npm run desktop:install
```

安装后的常用命令：

```bash
mio show
mio start
mio thinking
mio working
mio waiting
mio complete
mio hide
mio status
mio quit
```

`start`、`thinking`、`working`、`waiting` 会显示对应神态，`complete` 显示开心表情并在 4.5 秒后淡出。`blink`、`look X Y` 和 `emotion ID` 可用于调试。首次执行显示命令时，客户端会自动启动后台宿主。

八种神态：待命、开心、好奇、思考、专注、惊讶、困困、困惑。支持自动眨眼、双眨眼（Shift + 空格）、八方向视线、鼠标跟随、点击双眼互动、活泼程度调节、浅色 / 暮色壁纸、磨砂浓度和沉浸预览。工作周期演示约 26 秒，可随时停止或切换表情。

快捷键：`1`–`8` 切换神态；空格眨眼；方向键移动视线；`F` 切换沉浸；`Esc` 退出沉浸。启用系统减少动态效果偏好时，关闭自动游移、呼吸与循环装饰，保留手动切换并减小回弹。切到后台时暂停画布。

眼睛内部使用面积较大、颜色较淡的柔和紫色面光，默认约覆盖眼面 23%，保持紫色眼形的视觉重心。高光依附眼面，随眼睛旋转、弯曲与眨眼一起变形；开心时舒展并弯起，专注时压成横向低亮面，思考时向侧上方收拢，好奇与困惑时配合两眼的不对称。它在待命时不自行游移、旋转或周期性变形，仅有微弱亮度呼吸；注意目标改变时，小幅跟随并平稳收住。关闭“自然小动作”会停止自动视线与眨眼，高光仍会响应手动注意目标与情绪。系统减少动态效果偏好会关闭自动动作和亮度呼吸。表演节奏与研究来源见 [docs/MOTION.md](docs/MOTION.md)。

光标跟随默认开启。浏览器调试台覆盖整个页面和沉浸模式，包括控制区，只跟踪页面内指针；安装后的桌面版由 KWin 脚本接收全局系统光标，并将坐标映射到每块显示器。视线按眼睛中心映射并平滑限幅，高光略迟于眼形响应，并在眼面范围内明显偏向目标。眼形、间距与轻微倾斜共同辅助注意表达：目标一侧略舒展，另一侧轻收；侧看时略收拢间距，上看时微睁，下看时微眯。形变幅度约为原眼形的几个百分点，并保留当前表情。光标停下会持续注视该位置；离开页面后短暂停留再回归。键盘和方向按钮可暂时指定视线，下一次光标移动会恢复跟随。右侧光标按钮可关闭浏览器内跟随。

开心时使用上下两边同步弯曲、厚度均匀的长方形。沉浸模式按屏幕宽高计算双眼尺寸，不设固定像素上限，双眼位于画面正中；视线和弹跳幅度按放大后的比例收敛，文字位于眼睛下方。控制台预览与沉浸模式共用这套自适应构图。

## 接入 harness

眼睛由同一组连续的弹簧参数驱动，切换神态不替换动画片段。`eyes.js` 内的 `Eyes` 可复用到提供 Canvas 的宿主；本地预览通过 `window.mio` 暴露接口：

```js
window.mio.start();              // 收到任务 → 好奇
window.mio.thinking();           // 规划 → 思考
window.mio.working();            // 工具执行 → 专注
window.mio.waiting();            // 需要输入 → 困惑
window.mio.complete();           // 完成 → 开心
window.mio.idle();               // 待命
window.mio.setEmotion('sleepy'); // 也可直接指定八种神态
window.mio.look(-1, 1);          // 左下方，随后自动回归
window.mio.blink(true);          // 双眨眼
```

Agent harness 推荐只发送生命周期命令：

```bash
mio start
mio thinking
mio working
mio waiting
mio complete
```

`start` 自动启动后台宿主并显示好奇；`thinking`、`working`、`waiting` 分别表达规划、工具执行和等待输入；`complete` 开心约 4.5 秒后淡出；`idle` 和 `hide` 只隐藏画面，宿主继续等待下一条命令。桌面宿主通过 `$XDG_RUNTIME_DIR/mio-eyes.sock` 接收命令。每块显示器都有独立的全屏背景层，所有层共享相同的工作状态；光标位置由轻量 KWin 脚本经 `com.mio.Eyes` D-Bus 服务送入动画，驱动双眼眼形、眼距、高光的位置和注意力节奏。

Plasma 壁纸配置变化会被监听并自动重载。模糊由宿主页面内的壁纸副本完成，不依赖当前 KWin blur 开关。右下角托盘菜单可以显示、隐藏、播放完整工作周期或退出。

## 仓库结构

```text
eyes.js                         眼形、弹簧、高光、眨眼与渲染核心
app.js index.html style.css     浏览器调试台
desktop.js desktop.html desktop.css
                                安装版无控制台渲染页
desktop/main.cpp                Qt 背景层、壁纸、命令与托盘宿主
desktop/DesktopWindow.qml       桌面网页与动画状态桥
bin/mio                         本地控制客户端
packaging/                      用户安装、自启动与 KWin 光标桥
tests/eyes.test.mjs             动画与构图回归测试
docs/MOTION.md                  眼神表演、高光和注意力动作约定
docs/gallery/                   开发过程视觉快照
AGENTS.md                       仓库记忆与后续维护约束
```

## 验证

```bash
npm test
npm run check
npm run desktop:build
```

`npm test` 检查表情间的物理收敛、帧率稳定性、单 / 双眨眼时序、开心弯带几何、全屏构图、高光继承和注意力行为。`npm run check` 检查脚本语法，`npm run desktop:build` 编译 Qt 宿主。涉及安装或桌面层时应重新运行 `npm run desktop:install`、`mio status`，并确认壁纸层位于普通窗口下方、输入完全穿透、全局光标能驱动视线和高光。

详细动作台本、研究参考和视觉约束见 [docs/MOTION.md](docs/MOTION.md)；维护须知与不可破坏的桌面约束见 [AGENTS.md](AGENTS.md)；开发截图见 [docs/gallery](docs/gallery/)。
