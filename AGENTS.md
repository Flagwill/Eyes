# AGENTS.md — MIO 仓库记忆

## 项目目标

MIO 是 Agent harness 的桌面存在层。Agent 工作时，它会在壁纸上方显示一层半透明磨砂玻璃和一双紫色抽象眼睛，用连续动画表达好奇、思考、专注、等待、完成等状态。

浏览器调试台与 KDE 桌面版必须继续共用同一套眼睛引擎。浏览器调试台保留在 `http://127.0.0.1:5173/`，桌面版用于真实工作周期。

## 不可破坏的产品约束

- 桌面层只能覆盖壁纸。桌面图标、任务栏、普通应用窗口和系统面板必须位于 MIO 上方。
- 背景窗口必须全屏、四边锚定、零独占区、无焦点，并完全穿透鼠标和键盘输入。
- 双眼是全屏视觉中心；尺寸随屏幕缩放，不设置会限制大屏表现的固定像素上限。
- 动画必须以连续弹簧参数过渡。不要用离散帧替换眼形，避免表情切换时跳变。
- 高光是低对比、柔边的紫色面光，用于补充神态和注意力。它不能变成抢眼的小亮点，也不能与眼形反向旋转。
- 待命时高光位置和形状稳定，只允许极弱的亮度呼吸；注意目标变化时再响应。
- 开心状态是上下两条边同步弯曲、厚度一致的长方形眼睛。
- 安装后的桌面版追踪 KDE 全局系统光标；WebUI 只追踪页面内光标。两者必须保留各自作用范围。
- 光标注意力应同时影响视线、高光、近侧眼形、眼距和轻微倾斜，但幅度受控，不覆盖当前情绪。
- `complete` 先显示开心状态约 4.5 秒，再自动淡出。只读命令不能取消这个计时器。
- `idle` 和 `hide` 只隐藏画面，后台宿主继续运行，等待下一个 harness 命令。

## 目录地图

- `eyes.js`：眼睛几何、表情参数、弹簧、高光、眨眼和渲染核心。
- `tests/eyes.test.mjs`：动画连续性、表情收敛、布局、高光和注意力行为回归。
- `app.js`、`index.html`、`style.css`：浏览器调试台和控制面板。
- `app.js` 与桌面渲染共享 `eyes.js`；不要复制第二套表情参数。
- `desktop/main.cpp`：Qt 宿主、LayerShell 背景层、壁纸读取、Unix socket、D-Bus、托盘和多屏管理。
- `desktop/DesktopWindow.qml`：Qt 与桌面网页之间的状态、显隐、注意力和动作桥。
- `desktop.js`、`desktop.html`、`desktop.css`：桌面版的无控制面板渲染页。
- `bin/mio`：本地控制客户端；连接 `$XDG_RUNTIME_DIR/mio-eyes.sock` 并按需启动宿主。
- `packaging/install-user.sh`：用户级安装、自启动、KWin 脚本注册和宿主启动。
- `packaging/kwin-mio-eyes-cursor/`：将 KWin 全局光标发送到 `com.mio.Eyes /Cursor`。
- `docs/MOTION.md`：眼神表演、高光和注意力动作台本。
- `docs/gallery/`：开发过程中的视觉快照，不是运行时依赖。

## 运行接口

常用命令：

```bash
mio start       # 好奇，任务开始
mio thinking    # 思考
mio working     # 专注执行
mio waiting     # 等待用户输入
mio complete    # 开心，4.5 秒后淡出
mio idle        # 隐藏并待命
mio show
mio hide
mio status
mio quit
```

调试动作：`mio blink [double]`、`mio look X Y [SECONDS]`、`mio emotion ID`。完整神态为 `idle`、`happy`、`curious`、`thinking`、`focused`、`surprised`、`sleepy`、`confused`。

## 桌面实现要点

- KDE Plasma 6 Wayland 下的主体窗口使用 `LayerShellQt::Window::LayerBackground`。
- 每个 `QScreen` 拥有独立背景窗口；所有窗口共享状态，注意力坐标为全局屏幕坐标并按显示器边界裁剪。
- `MIO_LAYER_OVERLAY=1` 只用于生产视觉检查；正常安装和启动不得使用 overlay 层。
- 壁纸由应用自行读取并模糊，不依赖当前 KWin blur 配置；KDE 壁纸配置变化会触发重载。
- KWin 脚本通过 `workspace.cursorPosChanged` 推送全局指针位置。`QCursor::pos()` 只是脚本不可用或超过 700ms 未收到更新时的回退。
- 自启动只能有一个用户级入口：`~/.config/autostart/mio-desktop-autostart.desktop`。旧版本曾在安装前缀的 `etc/xdg/autostart` 留下重复入口，安装脚本必须继续清理该旧路径。

## 环境与构建

浏览器调试台只需要 Node.js 和 Python 3。

KDE 桌面版需要 Plasma 6 Wayland、CMake、Ninja，以及 Qt 6 Base/Declarative/WebEngine、LayerShellQt、KF6WindowSystem。Arch Linux 当前验证组合包括：

```bash
sudo pacman -S --needed cmake ninja qt6-base qt6-declarative \
  qt6-webengine layer-shell-qt kwindowsystem plasma-workspace
```

## 验证顺序

修改后至少运行：

```bash
npm test
npm run check
npm run desktop:build
```

涉及安装、KWin、自启动或 LayerShell 时，再运行：

```bash
npm run desktop:install
mio status
```

真实桌面验证应确认：壁纸层位于普通窗口下方；输入完全穿透；全局光标可驱动视线与高光；`complete` 自动淡出；安装后没有重复自启动项。不要用渲染截图替代以下自动回归：

- 所有表情可连续收敛并适配极端屏幕比例。
- 单 / 双眨眼时序正确。
- 开心双眼保持等厚弯带。
- 高光继承眼形旋转和曲率，静止时不会巡游。
- 注意力会改变近侧眼形、眼距、倾斜和高光，并完整留在眼面内。

## 修改原则

- 视觉调整优先修改连续的 pose、spring 和 light 参数，不在宿主层打补丁。
- 修改表情或高光语义时，同时更新 `README.md`、`docs/MOTION.md` 和相关测试。
- 不提交 `build/`、Python 缓存、运行日志、编辑器配置或机器相关路径。
- 不引入凭据、个人 token、壁纸内容或其他用户数据。
- 调试台静态服务必须继续只监听 `127.0.0.1`。
