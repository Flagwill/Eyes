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
- `ACTIVITIES` 是 20 种工作状态目录，`EXPRESSIONS` 合并八种情绪与工作状态；各状态共用眼形、起势、三种动作、视线和道具弹簧。`eyes activity ID` / `setActivity(ID)` 为精确入口。活动元数据随 Rive manifest 生成并嵌入 Qt 宿主，不在 C++ 维护第二份目录。新增状态须同步 QML 的五个小写输入、Rive 素材、台本与全状态 GPU 回归。纸笔、终端等道具由共享 `accentDesigns` 绘制正面、厚度与切面明暗；`propA/B/C` 驱动落笔、输出、连接和翻页，与眼睑同拍。`getPropViewX/Y` 按视线做透视缩放与旋转，Rive 必须用 `propbase` 加四个方向的 Direct blend 每帧重置基准，禁止恢复会残留前帧变换的 1D 透视混合。道具不随眨眼压扁；见 ADR-009。
- `assets/eyes/eyes.riv`、`rive-renderer.js`：浏览器与桌面默认播放的同一份 Rive 素材及 WASM 适配。Rive 使用真实状态机和向量渲染；Canvas 样条绘制保留为浏览器降级路径。
- `tools/build-rive.mjs`：从共享姿态和动作函数生成 RML，并用本地 Rive CLI 编译素材。修改共享核心或生成器后运行 `EYES_RIVE_CLI=/path/to/rive npm run eyes:author`，同步提交 `.riv` 和 manifest；测试核验源码与素材校验值。普通构建不需要 CLI，不登录、不上传。
- 每种情绪的 Rive 输入包含 `still`、`act`、`entry`、`follow`、`resolve`。它们是静态基姿，动作权重、视线和 `flowphase` 均由共享模型时钟控制，禁止恢复独立运行的眼睑循环。三种互补动作各有弹簧，起势单独衰减，重复状态不重播。`flow` 只控制低亮反光的可见程度。见 ADR-006。
- `cmake/Rive.cmake`、`desktop/rive-settings.h`、`cmake/rive-path-tail.cpp`：固定开源源码和校验值，编译独立 LGPL Qt Quick RHI 插件，注册枚举并修正单位坐标三角化精度。输入名全部小写，避免上游通知连接错误。更新须核对 [vendor/rive/README.md](vendor/rive/README.md)。
- `vendor/sentient-eye-engine/rig.js`：MIT 许可的 Sentient Eye Engine 五点样条内核移植；保留固定上游源码和许可证。浏览器先加载它，CMake 将它与核心合并为 QML 包，不要只安装未合并的 `eyes-core.js`。
- `gallery.html`、`gallery.js`：使用真实引擎的八种情绪与二十种工作状态等尺寸对照。
- `eyes.js`：浏览器生命周期和画布适配。
- `tests/packaging.test.mjs`：旧版本入口清理、当前安装及壁纸图片保留、面板隔离回归。
- `tests/eyes.test.mjs`：动画连续性、表情收敛、布局、高光和注意力行为回归。
- `app.js`、`index.html`、`style.css`：浏览器调试台和控制面板。
- 浏览器与桌面渲染共享 `eyes-core.js`；不要复制第二套表情参数或眨眼几何。
- 表情通过共享眼睑参数及中段控制点驱动五点样条，上下眼睑各用 `compileSmooth` 编译为四段曲率连续的三次系数；端点切线取弯曲与斜率的解析值。原始 `compile` 仅保留上游一致性回归，不能恢复重复端点造成的反向肩部曲率。Rive 使用等价三次顶点和切线，参考 Canvas/GLSL 继续回归。不要恢复独立二次曲线近似，不要用大角度整眼旋转代替情绪。按用户要求默认启用少量眉线、问号、星星等辅助元素；眉毛须略长于眼宽，以直线切面保留厚眉头、轻折峰和渐细眉尾。思考状态不显示眼镜或独立符号，由半眯眼形与侧上方视线表达；Rive 必须把辅助层绘制在眼形上方，Canvas 与 Rive 保持同一层级。它们补充眼形，共用表情弹簧与 Rive 素材，禁止单独随机飘动或闪烁。无字体路径与姿态统一定义在核心的 accentDesigns / getAccentStates；辅助层不随眨眼压扁，减少动态效果保留静态提示，显式 accents:false 可关闭。调试台缩略图使用同一素材。
- `desktop/main.cpp`：无窗口 Qt 后台、Unix socket、WebSocket、D-Bus、托盘和按屏幕映射光标。
- `integrations/codex/hooks.json`、`integrations/codex/eyes-codex-hook.py`：用户级 Codex 生命周期适配器源；安装到 `~/.codex`，只调用现有 Eyes 命令，错误必须静默并以 0 退出。不要在仓库内保留第二份 `.codex` hook 入口，否则已信任的项目级配置会与用户级配置重复驱动状态。
- `packaging/plasma-wallpaper/org.eyes.wallpaper/`：Plasma 壁纸包；`main.qml` 管理磨砂缓存和状态桥，`EyeScene.qml` 适配共享模型，`eye.frag` 绘制 GPU 眼睛。
- `RiveEyeScene.qml` 为产品默认场景，使用原生 GPU 插件；`EyeScene.qml` / `eye.frag` 为几何参考。两条路径均须运行 GPU 回归。Rive 使用实际输出尺寸的目标，禁止固定低分辨率画面拉伸到桌面。
- Rive 桌面场景保留 SMAA，并通过 `cmake/RiveAntialiasing.cmake` 在独立离屏目标中启用显卡支持的 8×/4×/2× 多重采样；颜色、模板与绘制管线采样数必须一致，最终合成管线匹配 Qt 实际目标。最终线性取样，预乘透明度只合成一次。路径精度为 4096 单位。GPU 回归覆盖全部 28 种姿态和亚像素位移，检查实际中间覆盖、狭窄过渡和正确淡出，不能只检查轮廓位置。
- `tests/qml/tst_eyes.qml`：Qt 6 GPU 实际像素、表情、透明边界和眨眼测试。
- `bin/eyes`：本地控制客户端；连接 `$XDG_RUNTIME_DIR/eyes.sock` 并按需启动宿主。
- `packaging/migrate-legacy-install.sh`：停止并移除旧版本的命令、插件与自启动项，不删除壁纸图片或用户数据。
- `packaging/install-user.sh`：用户级安装、自启动、Codex hooks、KWin 脚本注册和宿主启动。`packaging/install-codex-hooks.py` 合并用户 hooks，不得覆盖其他工具条目。
- `packaging/kwin-eyes-cursor/`：将 KWin 全局光标发送到 `org.eyes.Desktop /Cursor`。
- `docs/MOTION.md`：眼神表演、高光和注意力动作台本。
- `docs/CODEX.md`：Codex Desktop hooks 映射、信任步骤和限制。
- `docs/gallery/`：开发过程中的视觉快照，不是运行时依赖。

## 运行接口

常用命令：

```bash
eyes start       # 好奇，任务开始
eyes thinking    # 思考
eyes working     # 专注执行
eyes waiting     # 等待用户输入
eyes activity editing  # 精确工作状态，纸笔与低头扫视
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
- Rive 原生 Qt Quick RHI 插件绘制清晰眼形与内部高光；`FrameAnimation` 驱动共享弹簧输入。禁止恢复整屏逐帧 Canvas、WebView 或 CPU 模糊阴影。插件必须 `interactive: false` 且 `enabled: false`，输入继续穿透。
- 产品辅助元素在同一 Rive 素材内以向量绘制；仅参考 GLSL 场景保留 560×340 模型单位的装饰 Canvas。全屏尺寸由共享场景缩放决定，不降低眼睛或辅助元素的 GPU 输出分辨率。
- 静态磨砂由 `ShaderEffectSource live: false` 缓存；仅图片加载、尺寸变化时刷新。隐藏后保留原始清晰壁纸，不依赖 KWin blur。
- Qt 6 ShaderTools 在构建时生成 `build/wallpaper-ui/eye.frag.qsb`，必须随壁纸包安装。不要提交生成文件。
- Plasma 的 QQmlEngine 会缓存旧组件，切换壁纸类型不保证加载新代码。安装器比较场景、共享模型、`.riv` 和 native plugin，变化时刷新 `plasma-plasmashell.service`；验证须在实际 Plasma 日志看到 `Eyes GPU wallpaper loaded` 和 `Eyes Rive wallpaper loaded`。
- 壁纸守护必须同时更新配置文件和运行中的 containment。`kwriteconfig6 --notify` 只保存键值，不能可靠把已运行的 `org.kde.image` 切回 Eyes；恢复后必须通过 PlasmaShell `evaluateScript` 验证两张桌面在运行时都是 `org.eyes.wallpaper`。状态桥客户端须在 URL 就绪后激活，并在 `Open` 后主动请求快照。
- 可临时设置壁纸配置 `DebugPerformance=true`，日志每 5 秒报告 `EYES_PERF GPU`。不要只凭独立测试窗口的帧率宣布桌面已修复。完成测量后关闭日志。
- 常驻默认 `AnimationFps=60`（20–60）。`AnimationClock.qml` 仍用 FrameAnimation 累计真实帧间隔，隐藏后停钟且不追补隐藏时间。`cmake/RiveScheduling.cmake` 让 Rive 仅随模型更新，在当前帧 prepare 阶段绘制并缓存向量和 SMAA；不要恢复原生自刷新或每帧反向输入轮询。淡出后 Loader 卸载眼睛场景以释放渲染目标；宿主继续待命。见 ADR-008。
- WebSocket 桥仅监听 `127.0.0.1:38271`。断开后必须隐藏画面，避免后台停止后仍残留最后一帧眼睛。
- KWin 脚本通过 `workspace.cursorPosChanged` 推送全局指针位置。静止时不再发事件，最后一个有效坐标必须持续保留；禁止按事件超时回退到 Wayland 的 `QCursor::pos()`（无焦点时可能返回原点）。仅 X11/xcb 在未取得 KWin 坐标前可用全局 QCursor 回退，未知坐标时 attention.active=false。
- 桌面壁纸只做纯模糊（blur=1、blurMax=64、blurMultiplier=1），不叠加白色蒙版、渐变、边框，不调整饱和度、亮度或对比度。
- 自启动只能有一个用户级入口：`~/.config/autostart/eyes-desktop-autostart.desktop`。旧版本曾在安装前缀的 `etc/xdg/autostart` 留下重复入口，安装脚本必须继续清理该旧路径。

## 环境与构建

浏览器调试台需要 Node.js，首次执行 `npm ci` 安装固定的 Rive WASM 包。首轮桌面构建会下载校验固定版本的 Rive / Qt 桥接源码；运行时不访问 CDN。Qt 私有头文件升级后须重建 native plugin。

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

涉及输出尺寸或像素密度时，运行 `npm run desktop:hidpi:test`。它使用实际 X11 / XWayland 窗口；Qt 6.12 的离屏高 DPI 截图有独立复现的问题，不能据其裁切画面判断 Rive 失败。原生目标尺寸必须包含 `Screen.devicePixelRatio`，并映射回相同逻辑构图。

真实桌面验证应确认：壁纸层位于普通窗口下方；输入完全穿透；全局光标可驱动视线与高光；`complete` 自动淡出；安装后没有重复自启动项。不要用渲染截图替代以下自动回归：

- 所有表情可连续收敛并适配极端屏幕比例。
- 单 / 双眨眼时序正确。
- 开心双眼保持等厚弯带。
- Rive 主面光中心按上下样条之间的真实曲面投影，并使用真实眼形裁切，继承眼形旋转与开合，静止时不巡游；参考渲染器保留完整曲面密度投影。次级反光按低亮度节奏同向流动，不独立旋转或随机抖动。
- 注意力会改变近侧眼形、眼距、倾斜和高光，并完整留在眼面内。

## 修改原则

- 视觉调整优先修改连续的 pose、spring 和 light 参数，不在宿主层打补丁。
- 修改表情或高光语义时，同时更新 `README.md`、`docs/MOTION.md`、Rive 素材与相关测试。更新样条移植时同步固定版本、MIT 版权和上游一致性测试。选型与兼容限制见 ADR-005；Rive CLI / 编辑器不是开源运行时，不把它们声明为完全开源工具链。
- 不提交 `build/`、Python 缓存、运行日志、编辑器配置或机器相关路径。
- 不引入凭据、个人 token、壁纸内容或其他用户数据。
- 调试台静态服务必须继续只监听 `127.0.0.1`。
