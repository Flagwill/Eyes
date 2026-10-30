# Eyes 底层渲染重构：网格裁切与自动抗锯齿

2026-10-30，Radeon 680M 集成显卡，真实 Plasma 壁纸。对照组是上一轮已经优化过的版本，
即兼容通道合并、固定启用 SMAA 的版本。新版本已安装。

## 实际桌面结果

| 指标 | 上一轮版本 | 本轮版本 | 降幅 |
| --- | ---: | ---: | ---: |
| 待命：Plasma GPU 引擎占用 | 50.25% | 14.12% | 71.9% |
| 编辑：Plasma GPU 引擎占用 | 54.24% | 14.80% | 72.7% |
| 待命：平均 GPU 帧时间 | 8.15 ms | 2.25 ms | 72.4% |
| 编辑：平均 GPU 帧时间 | 8.78 ms | 2.37 ms | 73.0% |
| 编辑：GPU 帧时间 P95 | 10.12 ms | 3.54 ms | 65.0% |
| 编辑：Plasma GPU 驻留内存 | 1319.55 MiB | 745.37 MiB | 43.5%，少 574.19 MiB |
| 编辑：Plasma CPU | 39.02% | 38.44% | 基本持平 |
| 编辑：模型动画帧率 | 59.0–59.9 FPS | 59.1–59.7 FPS | 保持接近 60 FPS |

GPU 引擎占用为 `plasmashell` 的 DRM gfx 累计纳秒除以采样墙钟时间，包括 Plasma 其他
组件；不是整机所有应用的 GPU 占用。内存取同进程 DRM vram/gtt 驻留统计，按 DRM
client 去重。CPU 以一个逻辑核心为 100%，包含逐帧性能日志，不能视为关闭日志时的
日常占用。CPU 没有出现与 GPU 降幅相对应的大幅增长。

相对隐藏状态，编辑周期新增 GPU 驻留内存约从 1074 MiB 降到 484 MiB。背景、字形和
其他 Plasma 缓存也在这些数字内，所以同时保留总驻留值供复核。

最初未经两轮优化的编辑状态为 21.76 ms/帧，本轮为 2.37 ms，累计减少约 89%；
最初的数据与方法见[上一份报告](2026-10-30-render-batching.md)。
[完整结构化结果](2026-10-30-mesh-clipping.json)保存了本轮前后样本数、均值、中位数、
P95、GPU 引擎占用、内存、电源状态和画质误差。

## 实现

1. **提前裁切三角网格。** 使用 Rive 已经生成的 source/clip 三角网格做相交，保留新顶点
   的原始 paint 坐标。GPU 继续用原来的着色器计算渐变和材质；省掉逐形状模板绘制、
   清理和目标切换。CPU 处理的是少量几何，工作量不随屏幕像素数增长。
2. **清屏与向量绘制共用一个颜色通道。** 当前素材的向量裁切已烘焙进网格，所有路径
   可以按原顺序连续绘制，结束时解析一次 MSAA 颜色目标。
3. **额外缓冲按需创建。** 普通 source-over 状态只创建 A。需要读取目标颜色的混合模式
   出现时才创建 B/intermediate，并重绑合成与 SMAA 输入。图像的原有模板裁切路径保留。
4. **自动抗锯齿。** 保留显卡支持的最高档 MSAA。至少 4× 时省去额外的三遍 SMAA
   后处理及其纹理；低采样后端自动补 SMAA。显式 SMAA 模式仍可作为质量参考。

共享动作、眼形、`.riv`、弹簧、光标注意力、整体透视、原生输出密度和 60 FPS 目标均保留。
设计与几何假设见 [ADR-015](../decisions/015-preclip-vector-meshes.md)。

## 画质取舍与检查

用户允许难以察觉的质量差异。本轮的额外取舍是亚像素边缘滤波，主体形状和材质仍保持。

在独立 D-Bus、虚拟 KWin 和真实 GPU 上，以 DPR=2、2232×1400 采集 28 种状态，每种
覆盖静态、自然动作、光标转向、眨眼与淡出，共 140 帧、437,472,000 个像素：

| 对照配置 | 变化像素 | 平均绝对通道差（0–255） | 最大单通道差 |
| --- | ---: | ---: | ---: |
| 新网格管线保留 SMAA | 1,333（0.00030%） | 0.00000110 | 1 |
| 最终默认 Automatic | 364,962（0.08342%） | 0.002685 | 65 |

默认策略有 **99.9166% 的像素完全相同**。较大的局部差异来自边缘和细线的 SMAA
滤波变化，不能据此说所有像素最多只差一个色阶。正常尺寸与放大边缘均已检查，
全部亚像素覆盖和窄过渡断言通过；没有通过模糊轮廓、降低分辨率或减慢动画获取收益。

验证完成：

- `npm test`：83 项通过；`npm run check`、桌面构建、安装通过。
- 显式保留 SMAA 的网格管线：304 项 GPU 检查通过。
- 最终 Automatic 策略：304 项 GPU 检查通过，包括全部状态、亚像素偏移、等厚笑眼、
  道具覆盖、高光、透视、眨眼、缓存与淡出。
- `eyes-geometry-test`：覆盖面积、相切边、空/退化网格、反向绕序、旋转和非等比 paint
  坐标回归通过。
- 安装后真实日志确认 `Eyes GPU wallpaper loaded`、`Eyes Rive wallpaper loaded`，
  用户隐藏和原壁纸恢复成功。

本机实际使用高采样硬件路径。低采样 SMAA 兜底保留在实现内，未另用低采样显卡实测。

## 开源技术调研与选择

以下为 2026-10-30 核实的上游情况；三个仓库最后推送均为 2026-10-29，均未归档。

| 候选 | 维护与许可 | 对本项目的适配判断 |
| --- | --- | --- |
| [Rive Renderer](https://github.com/rive-app/rive-runtime) | MIT，约 1,245 stars，活跃的 issue/PR；原生支持多种 GPU 后端 | 与 `.riv` 相符，但最新原生 GPU 后端仍需要新的 Qt/RHI 互操作和版本迁移，不能直接替换当前桥接 |
| [Vello](https://github.com/linebender/vello) | MIT/Apache-2.0，约 4,451 stars；10 月 2 日发布 Research 0.11 / Sparse Strips 0.3 | [Sparse Strips 架构](https://github.com/linebender/vello/blob/main/ARCHITECTURE.md)采用 CPU 准备、GPU 绘制，启发本轮几何划分；直接引入则需 Rust/wgpu 与新的 Rive adapter，compute 版本仍属研究实现 |
| [ThorVG](https://github.com/thorvg/thorvg) | MIT，约 1,898 stars；10 月 15 日发布 1.1.3 | [最新发布](https://github.com/thorvg/thorvg/releases/tag/v1.1.3)继续优化 stencil/局部更新；主要提供 SVG/Lottie 等接口，同样需要 Rive adapter 和材质兼容验证 |

选择借鉴减少中间工作、提前准备紧凑几何的思路，继续使用已有 Rive 状态机和 Qt RHI。
本轮没有引入这些项目的新运行时依赖，也没有复制它们的实现代码。几何预处理仍可能在
未来复杂裁切素材中增加 CPU 成本，因此保留直接几何测试与 CPU 测量。

## 测量条件与复测

同机 Plasma 6.8.1、Qt 6.12.0、Mesa 26.2.5，2240×1400、60.02 Hz、桌面缩放 1.4，
Qt 报告 DPR=2；光标静止，`AnimationFps=60`。每种状态预热 4 秒，采样约 12 秒。
前后均临时使用 `QSG_RHI_PROFILE=1` 与 `QSG_RENDER_TIMING=1`，每秒记录物理输出
电源；全部样本均为 On。通过持有 KDE `ChangeScreenSettings` D-Bus inhibition
防止自动熄屏，测量后释放。GPU 时间遵循 [Qt 时间戳语义](https://doc.qt.io/qt-6/qrhicommandbuffer.html#lastCompletedGpuTime)，
可能滞后若干帧；引擎占用另由 DRM 计数取得。

独立窗口探索中，同为 1596×1001、DPR=2，上一轮约 9.58 ms/帧，网格管线保留 SMAA
约 2.99 ms，仅硬件 MSAA 约 2.05 ms。实际桌面结论使用上表，不用独立窗口代替。
采样较短，默认 GPU 动态频率和其他桌面活动仍会影响数字。

复测工具：

```bash
cmake --build build --target eyes-render-benchmark eyes-geometry-test -j2
build/eyes-geometry-test
QT_QUICK_BACKEND=rhi QSG_RHI_BACKEND=opengl \
  build/eyes-render-benchmark "$PWD/tools/render-benchmark.qml"
```

工具报告实际尺寸、DPR、帧率及 GPU 时间；前后需使用相同尺寸和场景，并分别指向
各自构建目录。主桌面测量还需启用上述 Qt 日志、保持物理输出点亮，并采集同一
`plasmashell` 的去重 DRM 客户端。完成后关闭 `DebugPerformance`、移除临时环境并刷新
Plasma；本次已恢复原壁纸、用户隐藏与测试前的屏幕电源状态。
