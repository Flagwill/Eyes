# Eyes

Eyes 是本项目唯一的产品名称。

Eyes 是 Agent harness 的桌面存在层。Agent 工作时，它在壁纸上方铺一层半透明磨砂玻璃，用一双紫色抽象眼睛表达好奇、思考、专注、等待和完成。动画由连续的弹簧参数驱动，支持自动眨眼、八方向视线、系统光标跟随和基础情绪。

![Eyes 全屏构图](docs/gallery/preview-fullscreen.jpg)

桌面版使用 Plasma 6 原生壁纸插件，磨砂和双眼绘制在壁纸内部，桌面图标、面板与普通窗口始终位于它上方。插件不接收输入，后台只负责状态、全局光标与托盘。浏览器和桌面现在默认使用 **[Rive 开源运行时](https://github.com/rive-app/rive-runtime)**，共同播放同一份 `assets/eyes/eyes.riv`：完整状态机、连续表情混合和向量绘制都由 Rive 执行。`eyes-core.js` 保留共享动作设计、弹簧、注意力和布局；Sentient 五点样条作为素材的几何来源和浏览器降级绘制路径。

## 快速开始

浏览器调试台需要 Node.js。首次运行先安装固定版本的 Rive 依赖：

```bash
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173/>。静态服务只监听本机回环地址。

KDE 桌面版需要 Plasma 6 Wayland、CMake、Ninja，以及 Qt 6 Base / Declarative / WebSockets / ShaderTools。Arch Linux 可使用：

```bash
sudo pacman -S --needed cmake ninja qt6-base qt6-declarative \
  qt6-websockets qt6-shadertools plasma-workspace
```

构建桌面宿主和原生 Rive GPU 插件（首次构建下载约 28MB 固定版本源码并核对 SHA-256；之后使用构建缓存，不在运行时联网）：

```bash
npm run desktop:build
```

安装到用户目录、保留原壁纸并启用登录自启动（更新绘制代码时会刷新 Plasma 桌面和面板，应用窗口保留）：

```bash
npm run desktop:install
```

安装后的常用命令：

```bash
eyes show
eyes start
eyes thinking
eyes working
eyes waiting
eyes complete
eyes hide
eyes status
eyes quit
```

`start`、`thinking`、`working`、`waiting` 会显示对应神态，`complete` 显示开心表情并在 4.5 秒后淡出。`blink`、`look X Y` 和 `emotion ID` 可用于调试。首次执行显示命令时，客户端会自动启动后台宿主。

八种神态：待命、开心、好奇、思考、专注、惊讶、困困、困惑。支持自动眨眼、双眨眼（Shift + 空格）、八方向视线、鼠标跟随、点击双眼互动、活泼程度调节、浅色 / 暮色壁纸、磨砂浓度和沉浸预览。工作周期演示约 26 秒，可随时停止或切换表情。

八种表情共用无圆角矩形眼面，上、下眼睑各由五个控制点驱动。Sentient Eye Engine 的样条内核让内眼角、外眼角和中段张力能独立变化，所有参数仍通过连续弹簧过渡。开心保持等厚弯带，好奇睁眼探看，思考半眯并望向侧上方，专注收紧内侧眼睑，惊讶双眼张开，困倦低垂，困惑一侧抬眼、一侧怀疑地收住。默认配合少量辅助元素：专注与困惑的粗眉、好奇与困惑的小问号、思考的细框眼镜、开心的双星、惊讶的短线和困倦的两个小 Z。待命保持安静。它们是同一 Rive 素材中的向量，主画面、按钮缩略图和桌面同步显示。设计与兼容约定见 [辅助元素决策](docs/decisions/007-shared-expression-accessories.md)。

[打开八种表情对照](http://127.0.0.1:5173/gallery.html)，可同时观察等尺寸的八组眼睛，重播从待命进入表情的过程、播放微动作、隐藏名称或点击单个画面眨眼。主调试台保留光标、工作周期和沉浸预览。

每种情绪包含起势和三种互补动作：开心提眼后留下笑意，好奇先探看、另一眼跟上，再略收眼检查；思考收眼、停顿后放开；困惑回看时转移两侧眼睑斜率和张力；困倦慢慢下垂后短暂抬起；专注保留稳定注视。视线、眼睑和反光共用一个可暂停时钟，切换后从同一动作起点开始。上下眼睑分担不同的行程，重复发送同一状态不会重播起势。辅助元素随同一组表情弹簧淡入淡出，眉毛略长于眼宽，具有厚眉头、轻眉峰和渐细眉尾，随眼睑起伏；星星随笑眼轻提；眼镜和问号不会随眨眼挤扁，不使用独立闪烁循环。减少动态效果保留静态神态提示。

快捷键：`1`–`8` 切换神态；空格眨眼；方向键移动视线；`F` 切换沉浸；`Esc` 退出沉浸。系统减少动态效果偏好会关闭自发动作与回弹，保留手动切换和注视。切到后台时暂停画布。

内部高光使用低对比紫色漫射场，不再描画一只缩小的眼睛。Rive 主光的中心根据真实样条曲面定位，以宽阔的径向渐变绘制，并裁切在同一眼形内，随开合和眨眼变形。主光待命时位置固定，两块更淡的小矩形反光同向穿行、交错淡入淡出，单块强度低于 3%；关闭自然动作或减少动态效果时混合回静止姿态。表演与材质见 [docs/MOTION.md](docs/MOTION.md)，引擎选型与限制见 [Rive 决策](docs/decisions/005-rive-performance-runtime.md)。

光标跟随默认开启。浏览器调试台覆盖整个页面和沉浸模式，包括控制区，只跟踪页面内指针；安装后的桌面版由 KWin 脚本接收全局系统光标，并将坐标映射到每块显示器。视线按眼睛中心映射并平滑限幅，高光略迟于眼形响应，并在眼面范围内明显偏向目标。眼形、间距与轻微倾斜共同辅助注意表达：目标一侧略舒展，另一侧轻收；侧看时略收拢间距，上看时微睁，下看时微眯。形变幅度约为原眼形的几个百分点，并保留当前表情。光标停下会持续注视该位置；桌面版保留 KWin 最后一个有效坐标，不因静止超时切回原点。尚未取得有效坐标时保留当前表情的自然视线。浏览器中离开页面后短暂停留再回归。键盘和方向按钮可暂时指定视线，下一次光标移动会恢复跟随。右侧光标按钮可关闭浏览器内跟随。

开心时使用上下两边同步弯曲、厚度均匀的长方形。沉浸模式按屏幕宽高计算双眼尺寸，不设固定像素上限，双眼使用纵向更修长的比例，静止中心上移到屏幕高度约 43%，纵向注意位移收敛为原来的 70%；16:10 屏幕上的待命眼高约占屏幕 45%，避免只集中在下半屏。眼形采用无圆角的弯带，主体与轮廓均清晰，仅保留像素级抗锯齿，不使用边缘羽化、眼形模糊或外围光晕；文字位于眼睛下方。控制台预览与沉浸模式共用这套自适应构图。

## 接入 harness

八种情绪的混合权重由共享弹簧连续驱动，支持过渡中再次切换；Rive 将这些权重作用于眼睑、位置和材质，不替换离散眼睛图片。`eyes.js` 内的 `Eyes` 可复用到提供 Canvas 的宿主；本地预览通过 `window.eyes` 暴露接口：

```js
window.eyes.start();              // 收到任务 → 好奇
window.eyes.thinking();           // 规划 → 思考
window.eyes.working();            // 工具执行 → 专注
window.eyes.waiting();            // 需要输入 → 困惑
window.eyes.complete();           // 完成 → 开心
window.eyes.idle();               // 待命
window.eyes.setEmotion('sleepy'); // 也可直接指定八种神态
window.eyes.look(-1, 1);          // 左下方，随后自动回归
window.eyes.blink(true);          // 双眨眼
```

Agent harness 推荐只发送生命周期命令：

```bash
eyes start
eyes thinking
eyes working
eyes waiting
eyes complete
```

`start` 自动启动后台宿主并显示好奇；`thinking`、`working`、`waiting` 分别表达规划、工具执行和等待输入；`complete` 开心约 4.5 秒后淡出；`idle` 和 `hide` 只隐藏画面，宿主继续等待下一条命令。桌面宿主通过 `$XDG_RUNTIME_DIR/eyes.sock` 接收命令。每块显示器的原生壁纸插件共享相同的工作状态；光标位置由轻量 KWin 脚本经 `org.eyes.Desktop` D-Bus 服务送入动画，驱动双眼眼形、眼距、高光的位置和注意力节奏。

壁纸插件保留原图片，使用更强的纯模糊并缓存结果，不依赖 KWin blur；不叠加白色或染色蒙版，也不调整壁纸的饱和度、亮度或对比度。Rive 通过 Qt Quick RHI 在 GPU 绘制向量，输出纹理尺寸随屏幕构图放大，不把固定低分辨率画面拉伸到桌面。`FrameAnimation` 驱动共享弹簧输入。状态桥只监听 `127.0.0.1:38271`。后台退出或连接断开时，插件自动隐藏双眼、恢复清晰壁纸。托盘菜单可显示、隐藏、演示或退出。

## 仓库结构

```text
eyes-core.js                    共享表情、样条几何、弹簧、高光与 Canvas 渲染
vendor/sentient-eye-engine/      MIT 样条内核移植、许可证与固定上游源码
gallery.html gallery.js          真实共享引擎的八表情对照
eyes.js                         浏览器画布与生命周期适配
rive-renderer.js                Rive WASM、共享素材和浏览器绘制适配
assets/eyes/                    共享 Rive 素材与源码/二进制校验信息
tools/build-rive.mjs            从共享眼睑和动作台本生成 RML、编译素材
cmake/Rive.cmake                固定源码、许可证和 Qt Quick GPU 插件构建
app.js index.html style.css     浏览器调试台
desktop/main.cpp                无窗口后台、命令、WebSocket 光标与托盘桥
packaging/plasma-wallpaper/     Plasma 原生壁纸、GPU 眼睛与磨砂缓存
tests/qml/                     GPU 实际像素、表情和眨眼回归
bin/eyes                        本地控制客户端
packaging/                      用户安装、自启动与 KWin 光标桥
tests/eyes.test.mjs             动画与构图回归测试
tests/packaging.test.mjs        升级清理与壁纸保留回归
docs/MOTION.md                  眼神表演、高光和注意力动作约定
docs/gallery/                   开发过程视觉快照
AGENTS.md                       仓库记忆与后续维护约束
```

## 开源引擎与素材制作

Rive 运行时采用 MIT 许可，Qt 桥接基于 [basysKom/RiveQtQuickPlugin](https://github.com/basysKom/RiveQtQuickPlugin) 的 LGPL-3.0-or-later 代码，以独立动态库安装。版本、源码地址和许可证见 [vendor/rive](vendor/rive/README.md)。桌面适配补齐 Qt 6 枚举注册，所有输入采用小写以兼容桥接层。桌面包安装共享 `.riv` 文件、动态插件和第三方许可证。

素材由 `tools/build-rive.mjs` 从共享八种姿态和动作函数生成；每种情绪包含静止、起势、主动作、跟随和收束五种基姿，共享时钟和弹簧连续驱动它们的混合。Rive 不再自行循环眼睑动画，播放进度不同也会得到相同的动作姿态。五点眼睑采用端点切线约束的连续曲率样条，去掉弧线两侧不自然的反向弯折，保留矩形眼角与开心等厚。详见 [ADR-006](docs/decisions/006-continuous-lids-and-shared-performance-clock.md)。测试同时执行真正的 Rive WASM 和 Qt GPU，检查曲率、同步、起势、暂停和像素边界。浏览器启动失败时显示共享样条降级画面，并在控制台报告错误。

桌面眼睛在独立目标中优先使用 8× 多重采样，按显卡支持情况回退到 4×、2× 或单采样，并保留 SMAA。曲线细分精度提高到 4096 单位，最终画面使用线性取样和正确的预乘透明度合成，减少浅弧线和缓慢移动时的台阶、暗边。它不改变 Plasma 整体采样设置。像素回归覆盖八种表情的三个亚像素位置，同时检查中间覆盖和最多两物理像素的过渡，保留清晰轮廓。

修改表情或台本后，用官方 Rive CLI 1.7.0 在本地重新生成素材：

```bash
EYES_RIVE_CLI=/path/to/rive npm run eyes:author
```

CLI 和官方编辑器并非本项目所声明的开源运行时；CLI 只用于制作素材，普通构建直接使用已提交的 `.riv`。制作过程使用 `--verify` 和 `--once`，不登录、不上传，也不依赖脚本签名或付费导出。生成的 RML 位于 `build/rive/scene.rml`，校验记录确保素材不会落后于共享源码。

接入 [Sentient Eye Engine](https://github.com/Sentient-LabsDev/Sentient-Eye-Engine/tree/42761191371f328361b62b5cfd095aac3f58c33d) 的五点样条形变内核，固定版本并保留 MIT 许可。当前移植范围是曲线与控制点模型；Pygame 窗口、随机抖动、椭圆主体和外围光晕未引入。Eyes 继续提供弹簧、注意力、矩形弯带和曲面材质。

浏览器先加载 `vendor/sentient-eye-engine/rig.js` 再加载共享核心；CMake 将相同的两份源码合并为 QML 使用的 `build/wallpaper-ui/eyes-core.js`。原 `EyeScene.qml` / GLSL 路径保留为共享几何参考与回归对象，产品使用 `RiveEyeScene.qml`。更新样条移植时须遵循 [集成说明](vendor/sentient-eye-engine/README.md)，并重新生成 Rive 素材。

## 验证

```bash
npm test
npm run check
npm run desktop:build
```

`npm run desktop:test` 使用 Qt 6 检查 GPU 实际像素输出、八种表情、透明边界、注意力与眨眼，需要支持 ShaderEffect 的 RHI 后端；当前会话无法打开测试窗口时，可用 `QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=rhi QSG_RHI_BACKEND=opengl npm run desktop:test` 运行离屏实际像素检查。Qt 6 工具目录可通过 `QT6_BIN_DIR` 指定。`npm test` 检查表情间的物理收敛、帧率稳定性、单 / 双眨眼时序、开心弯带几何、全屏构图、高光继承和注意力行为。`npm run check` 检查脚本语法，`npm run desktop:build` 编译 Qt 宿主。涉及安装或桌面层时应重新运行 `npm run desktop:install`、`eyes status`，并确认壁纸层位于普通窗口下方、输入完全穿透、全局光标能驱动视线和高光。

`npm run desktop:hidpi:test` 在 X11 / XWayland 实际窗口中验证双倍像素密度。Rive 目标尺寸包括屏幕像素密度，再映射回逻辑构图。测试窗口会适配屏幕，避免被窗口管理器裁切。Qt 6.12 离屏后端的高 DPI 截图连普通矩形也会截错，因此这项检查使用实际窗口后端。

详细动作台本、研究参考和视觉约束见 [docs/MOTION.md](docs/MOTION.md)；维护须知与不可破坏的桌面约束见 [AGENTS.md](AGENTS.md)；开发截图见 [docs/gallery](docs/gallery/)。

## 命名与升级

产品名称统一为 **Eyes**。命令为 `eyes`，桌面后台为 `eyes-desktop`，浏览器接口为 `window.eyes`；可用 `EYES_DESKTOP_BIN` 指定后台程序，`EYES_INSTALL_PREFIX` 指定安装位置。桌面壁纸插件 ID 为 `org.eyes.wallpaper`，D-Bus 服务和接口为 `org.eyes.Desktop`，光标脚本 ID 为 `eyes-cursor`。

重新运行 `npm run desktop:install` 会保留壁纸图片、停止旧后台、卸载旧光标脚本，并清理旧命令、插件和重复自启动项。升级后请将外部 harness 配置中的旧命令与浏览器调用更新为上面的接口；不保留旧名称别名。命名与清晰轮廓的决策见 [ADR-002](docs/decisions/002-eyes-identity-and-crisp-contours.md)。
