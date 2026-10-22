# AGENTS.md — Eyes 仓库记忆

## 项目目标

- 唯一产品名称为 **Eyes**。命令、界面、文档与公共接口统一使用该名称；旧名称只允许出现在升级清理逻辑及其回归用例中，不保留运行别名。

Eyes 是 Agent harness 的桌面存在层。Agent 工作时，它会在壁纸上方显示一层半透明磨砂玻璃和一双紫色抽象眼睛，用连续动画表达好奇、思考、专注、等待、完成等状态。

浏览器调试台与 KDE 桌面版必须继续共用同一套眼睛引擎。浏览器调试台保留在 `http://127.0.0.1:5173/`，桌面版用于真实工作周期。

## 不可破坏的产品约束

- 桌面层只能覆盖壁纸。桌面图标、任务栏、普通应用窗口和系统面板必须位于 Eyes 上方。
- 桌面必须使用 Plasma 原生壁纸插件；后台不能创建全屏窗口，插件不能接管鼠标或键盘输入。
- 双眼是全屏视觉中心；尺寸随屏幕缩放，不设置会限制大屏表现的固定像素上限。沉浸构图纵向拉长 1.28 倍，中心位于高度约 43%，纵向注视整体位移乘以 0.7；浏览器和桌面必须共用 getLayout。
- 眼形采用无圆角的矩形/弯带；主体与边缘均保持清晰，只保留像素级抗锯齿；禁止眼形模糊、边缘羽化、外围光晕或圆角。
- 动画必须以连续弹簧参数过渡。不要用离散帧替换眼形，避免表情切换时跳变。
- 高光是低对比、柔边的紫色面光，用于补充神态和注意力。它不能变成抢眼的小亮点，也不能与眼形反向旋转。
- 主面光在待命时位置稳定，只允许极弱的亮度呼吸；另有两块低亮度的小矩形反光沿固定方向缓慢流动、淡入淡出，不旋转、不随机抖动，不抢夺眼形的视觉重心。关闭自然动作或减少动态效果时暂停小反光流动。
- 开心状态是上下两条边同步弯曲、厚度一致的长方形眼睛。
- 安装后的桌面版追踪 KDE 全局系统光标；WebUI 只追踪页面内光标。两者必须保留各自作用范围。
- 光标注意力应同时影响视线、高光、近侧眼形、眼距和轻微倾斜，但幅度受控，不覆盖当前情绪。
- `complete` 先显示开心状态约 4.5 秒，再自动淡出。只读命令不能取消这个计时器。
- `idle` 和 `hide` 只隐藏画面，后台宿主继续运行，等待下一个 harness 命令。

## 目录地图

- `eyes-core.js`：共享眼睛几何、表情参数、弹簧、高光、眨眼和 Canvas 渲染核心。
- `eyes.js`：浏览器生命周期和画布适配。
- `tests/packaging.test.mjs`：旧版本入口清理、当前安装及壁纸图片保留、面板隔离回归。
- `tests/eyes.test.mjs`：动画连续性、表情收敛、布局、高光和注意力行为回归。
- `app.js`、`index.html`、`style.css`：浏览器调试台和控制面板。
- 浏览器与桌面渲染共享 `eyes-core.js`；不要复制第二套表情参数或眨眼几何。
- `desktop/main.cpp`：无窗口 Qt 后台、Unix socket、WebSocket、D-Bus、托盘和按屏幕映射光标。
- `packaging/plasma-wallpaper/org.eyes.wallpaper/`：Plasma 壁纸包；`main.qml` 管理磨砂缓存和状态桥，`EyeScene.qml` 适配共享模型，`eye.frag` 绘制 GPU 眼睛。
- `tests/qml/tst_eyes.qml`：Qt 6 GPU 实际像素、表情、透明边界和眨眼测试。
- `bin/eyes`：本地控制客户端；连接 `$XDG_RUNTIME_DIR/eyes.sock` 并按需启动宿主。
- `packaging/migrate-legacy-install.sh`：停止并移除旧版本的命令、插件与自启动项，不删除壁纸图片或用户数据。
- `packaging/install-user.sh`：用户级安装、自启动、KWin 脚本注册和宿主启动。
- `packaging/kwin-eyes-cursor/`：将 KWin 全局光标发送到 `org.eyes.Desktop /Cursor`。
- `docs/MOTION.md`：眼神表演、高光和注意力动作台本。
- `docs/gallery/`：开发过程中的视觉快照，不是运行时依赖。

## 运行接口

常用命令：

```bash
eyes start       # 好奇，任务开始
eyes thinking    # 思考
eyes working     # 专注执行
eyes waiting     # 等待用户输入
eyes complete    # 开心，4.5 秒后淡出
eyes idle        # 隐藏并待命
eyes show
eyes hide
eyes status
eyes quit
```

调试动作：`eyes blink [double]`、`eyes look X Y [SECONDS]`、`eyes emotion ID`。完整神态为 `idle`、`happy`、`curious`、`thinking`、`focused`、`surprised`、`sleepy`、`confused`。

## 桌面实现要点

- 桌面使用 `org.eyes.wallpaper` Plasma 壁纸插件，后台不能再创建 Layer Shell 背景窗口，否则会遮挡桌面图标。
- 两个 GPU 着色器绘制清晰眼形与内部高光；`FrameAnimation` 驱动模型。禁止恢复整屏逐帧 Canvas 与 CPU 模糊阴影。
- 小装饰 Canvas 固定为 560×340 模型单位；全屏尺寸由场景缩放决定，不降低眼睛的 GPU 输出分辨率。
- 静态磨砂由 `ShaderEffectSource live: false` 缓存；仅图片加载、尺寸变化时刷新。隐藏后保留原始清晰壁纸，不依赖 KWin blur。
- Qt 6 ShaderTools 在构建时生成 `build/wallpaper-ui/eye.frag.qsb`，必须随壁纸包安装。不要提交生成文件。
- Plasma 的 QQmlEngine 会缓存旧组件，切换壁纸类型不保证加载新代码。安装器在绘制资源变化时刷新 `plasma-plasmashell.service`；验证须在实际 Plasma 日志看到 `Eyes GPU wallpaper loaded`。
- 可临时设置壁纸配置 `DebugPerformance=true`，日志每 5 秒报告 `EYES_PERF GPU`。不要只凭独立测试窗口的帧率宣布桌面已修复。完成测量后关闭日志。
- WebSocket 桥仅监听 `127.0.0.1:38271`。断开后必须隐藏画面，避免后台停止后仍残留最后一帧眼睛。
- KWin 脚本通过 `workspace.cursorPosChanged` 推送全局指针位置。静止时不再发事件，最后一个有效坐标必须持续保留；禁止按事件超时回退到 Wayland 的 `QCursor::pos()`（无焦点时可能返回原点）。仅 X11/xcb 在未取得 KWin 坐标前可用全局 QCursor 回退，未知坐标时 attention.active=false。
- 桌面壁纸只做纯模糊（blur=1、blurMax=64、blurMultiplier=1），不叠加白色蒙版、渐变、边框，不调整饱和度、亮度或对比度。
- 自启动只能有一个用户级入口：`~/.config/autostart/eyes-desktop-autostart.desktop`。旧版本曾在安装前缀的 `etc/xdg/autostart` 留下重复入口，安装脚本必须继续清理该旧路径。

## 环境与构建

浏览器调试台只需要 Node.js 和 Python 3。

KDE 桌面版需要 Plasma 6 Wayland、CMake、Ninja，以及 Qt 6 Base/Declarative/WebSockets/ShaderTools。Arch Linux 当前验证组合包括：

```bash
sudo pacman -S --needed cmake ninja qt6-base qt6-declarative \
  qt6-websockets qt6-shadertools plasma-workspace
```

## 验证顺序

修改后至少运行：

```bash
npm test
npm run check
npm run desktop:build
```

涉及安装、KWin、自启动或壁纸渲染时，再运行：

```bash
npm run desktop:install
eyes status
```

GPU 改动再运行 `npm run desktop:test`。光标桥修改时先停止桌面后台，再运行 `npm run desktop:cursor:test`；它在独立 D-Bus 和临时运行目录测试真实后台，仍需独占本机桥接端口。使用 `/usr/lib/qt6/bin` 下的 Qt 6 工具（其他发行版可设置 `QT6_BIN_DIR`）；本机 PATH 中同名 `qmllint`、`qmltestrunner` 可能指向 Qt 5。

真实桌面验证应确认：壁纸层位于普通窗口下方；输入完全穿透；全局光标可驱动视线与高光；`complete` 自动淡出；安装后没有重复自启动项。不要用渲染截图替代以下自动回归：

- 所有表情可连续收敛并适配极端屏幕比例。
- 单 / 双眨眼时序正确。
- 开心双眼保持等厚弯带。
- 主面光继承眼形旋转和曲率，静止时不会巡游；次级反光按低亮度节奏流动，不独立旋转或随机抖动。
- 注意力会改变近侧眼形、眼距、倾斜和高光，并完整留在眼面内。

## 修改原则

- 视觉调整优先修改连续的 pose、spring 和 light 参数，不在宿主层打补丁。
- 修改表情或高光语义时，同时更新 `README.md`、`docs/MOTION.md` 和相关测试。
- 不提交 `build/`、Python 缓存、运行日志、编辑器配置或机器相关路径。
- 不引入凭据、个人 token、壁纸内容或其他用户数据。
- 调试台静态服务必须继续只监听 `127.0.0.1`。
