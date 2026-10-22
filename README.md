# Eyes

Eyes 是本项目唯一的产品名称。

Eyes 是 Agent harness 的桌面存在层。Agent 工作时，它在壁纸上方铺一层半透明磨砂玻璃，用一双紫色抽象眼睛表达好奇、思考、专注、等待和完成。动画由连续的弹簧参数驱动，支持自动眨眼、八方向视线、系统光标跟随和基础情绪。

![Eyes 全屏构图](docs/gallery/preview-fullscreen.jpg)

桌面版使用 Plasma 6 原生壁纸插件，磨砂和双眼绘制在壁纸内部，桌面图标、面板与普通窗口始终位于它上方。插件不接收输入，后台只负责状态、全局光标与托盘。浏览器调试台继续保留，两者共享 `eyes-core.js` 的表情、几何和弹簧引擎。

## 快速开始

浏览器调试台只需要 Node.js 和 Python 3：

```bash
npm run dev
```

打开 <http://127.0.0.1:5173/>。静态服务只监听本机回环地址。

KDE 桌面版需要 Plasma 6 Wayland、CMake、Ninja，以及 Qt 6 Base / Declarative / WebSockets / ShaderTools。Arch Linux 可使用：

```bash
sudo pacman -S --needed cmake ninja qt6-base qt6-declarative \
  qt6-websockets qt6-shadertools plasma-workspace
```

只构建桌面宿主：

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

快捷键：`1`–`8` 切换神态；空格眨眼；方向键移动视线；`F` 切换沉浸；`Esc` 退出沉浸。启用系统减少动态效果偏好时，关闭自动游移、呼吸与循环装饰，保留手动切换并减小回弹。切到后台时暂停画布。

眼睛内部使用面积较大、颜色较淡的柔和紫色面光，默认约覆盖眼面 23%，保持紫色眼形的视觉重心。高光依附眼面，随眼睛旋转、弯曲与眨眼一起变形；开心时舒展并弯起，专注时压成横向低亮面，思考时向侧上方收拢，好奇与困惑时配合两眼的不对称。主面光在待命时位置稳定，仅有微弱亮度呼吸；两块更淡的小矩形反光以约 14 秒的节奏缓慢穿行和淡入淡出，单块亮度不超过约 9%，不旋转，不充当第二组瞳孔。困倦与专注时进一步收敛；注意目标改变时，小幅跟随并平稳收住。关闭“自然小动作”会停止自动视线、眨眼和小反光的流动，高光仍会响应手动注意目标与情绪。系统减少动态效果偏好会关闭自动动作和亮度呼吸。表演节奏与研究来源见 [docs/MOTION.md](docs/MOTION.md)。

光标跟随默认开启。浏览器调试台覆盖整个页面和沉浸模式，包括控制区，只跟踪页面内指针；安装后的桌面版由 KWin 脚本接收全局系统光标，并将坐标映射到每块显示器。视线按眼睛中心映射并平滑限幅，高光略迟于眼形响应，并在眼面范围内明显偏向目标。眼形、间距与轻微倾斜共同辅助注意表达：目标一侧略舒展，另一侧轻收；侧看时略收拢间距，上看时微睁，下看时微眯。形变幅度约为原眼形的几个百分点，并保留当前表情。光标停下会持续注视该位置；桌面版保留 KWin 最后一个有效坐标，不因静止超时切回原点。尚未取得有效坐标时保留当前表情的自然视线。浏览器中离开页面后短暂停留再回归。键盘和方向按钮可暂时指定视线，下一次光标移动会恢复跟随。右侧光标按钮可关闭浏览器内跟随。

开心时使用上下两边同步弯曲、厚度均匀的长方形。沉浸模式按屏幕宽高计算双眼尺寸，不设固定像素上限，双眼使用纵向更修长的比例，静止中心上移到屏幕高度约 43%，纵向注意位移收敛为原来的 70%；16:10 屏幕上的待命眼高约占屏幕 45%，避免只集中在下半屏。眼形采用无圆角的弯带，主体与轮廓均清晰，仅保留像素级抗锯齿，不使用边缘羽化、眼形模糊或外围光晕；文字位于眼睛下方。控制台预览与沉浸模式共用这套自适应构图。

## 接入 harness

眼睛由同一组连续的弹簧参数驱动，切换神态不替换动画片段。`eyes.js` 内的 `Eyes` 可复用到提供 Canvas 的宿主；本地预览通过 `window.eyes` 暴露接口：

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

壁纸插件保留原图片，使用更强的纯模糊并缓存结果，不依赖 KWin blur；不叠加白色或染色蒙版，也不调整壁纸的饱和度、亮度或对比度。清晰眼形与内部高光由预编译 GPU 着色器绘制，`FrameAnimation` 按屏幕刷新节奏驱动共享弹簧引擎；仅小装饰使用固定大小的 Canvas，避免逐帧重绘和上传整屏图片。状态桥只监听 `127.0.0.1:38271`。后台退出或连接断开时，插件自动隐藏双眼、恢复清晰壁纸。托盘菜单可显示、隐藏、演示或退出。实现原因和性能验证见 [渲染决策](docs/decisions/001-plasma-gpu-rendering.md)。

## 仓库结构

```text
eyes-core.js                    共享表情、几何、弹簧、高光与 Canvas 渲染
eyes.js                         浏览器画布与生命周期适配
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

## 验证

```bash
npm test
npm run check
npm run desktop:build
```

`npm run desktop:test` 使用 Qt 6 检查 GPU 实际像素输出、八种表情、透明边界、注意力与眨眼，需要图形会话；Qt 6 工具目录可通过 `QT6_BIN_DIR` 指定。`npm test` 检查表情间的物理收敛、帧率稳定性、单 / 双眨眼时序、开心弯带几何、全屏构图、高光继承和注意力行为。`npm run check` 检查脚本语法，`npm run desktop:build` 编译 Qt 宿主。涉及安装或桌面层时应重新运行 `npm run desktop:install`、`eyes status`，并确认壁纸层位于普通窗口下方、输入完全穿透、全局光标能驱动视线和高光。

详细动作台本、研究参考和视觉约束见 [docs/MOTION.md](docs/MOTION.md)；维护须知与不可破坏的桌面约束见 [AGENTS.md](AGENTS.md)；开发截图见 [docs/gallery](docs/gallery/)。

## 命名与升级

产品名称统一为 **Eyes**。命令为 `eyes`，桌面后台为 `eyes-desktop`，浏览器接口为 `window.eyes`；可用 `EYES_DESKTOP_BIN` 指定后台程序，`EYES_INSTALL_PREFIX` 指定安装位置。桌面壁纸插件 ID 为 `org.eyes.wallpaper`，D-Bus 服务和接口为 `org.eyes.Desktop`，光标脚本 ID 为 `eyes-cursor`。

重新运行 `npm run desktop:install` 会保留壁纸图片、停止旧后台、卸载旧光标脚本，并清理旧命令、插件和重复自启动项。升级后请将外部 harness 配置中的旧命令与浏览器调用更新为上面的接口；不保留旧名称别名。命名与清晰轮廓的决策见 [ADR-002](docs/decisions/002-eyes-identity-and-crisp-contours.md)。
