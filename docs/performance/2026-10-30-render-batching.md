# Eyes 渲染负载对比：合并兼容的矢量绘制通道

2026-10-30，在本机 Radeon 680M 集成显卡上测量。优化已安装到真实 Plasma 壁纸。

## 实际桌面结果

| 状态与指标 | 优化前 | 优化后 | 变化 |
| --- | ---: | ---: | ---: |
| 待命：平均 GPU 时间 | 13.15 ms/帧 | 8.43 ms/帧 | −35.9% |
| 待命：GPU 时间 P95 | 14.90 ms/帧 | 9.75 ms/帧 | −34.6% |
| 编辑：平均 GPU 时间 | 21.76 ms/帧 | 8.73 ms/帧 | −59.9% |
| 编辑：GPU 时间 P95 | 23.74 ms/帧 | 10.06 ms/帧 | −57.6% |
| 编辑：模型动画帧率 | 44.2–44.9 FPS | 58.7–59.8 FPS | 接近 60 FPS |

60 FPS 的每帧预算约为 16.67 ms。优化前的编辑状态超过这个预算；优化后恢复到预算内。
这些是 **GPU 每帧执行时间**，不是整个 GPU 的利用率百分比，也不直接代表功耗。

同一组采样中，整个 `plasmashell` 的 CPU 占用由待命 44.25% 降到 39.08%、编辑
42.92% 降到 39.83%（单个逻辑核心为 100%）。这些 CPU 数据包含 Plasma 其他组件，
并且开启了逐帧性能日志，不能当作日常关闭日志时的占用。隐藏时两版均无连续壁纸
GPU 时间样本，Plasma CPU 约为 0.17–0.25%。

## 测量条件

- 物理显示器：2240×1400、60.02 Hz，桌面缩放 1.4，Qt 场景报告 DPR=2。
- Plasma 6.8.1、Qt 6.12.0、Mesa 26.2.5，原版源码基线为
  `e38b636bdf7f51688f6da7b43ff0b744a4d439e9`。
- 两版均配置 `AnimationFps=60`，保留原生目标尺寸、设备像素密度、显卡支持的
  MSAA、SMAA、路径精度、渐变、高光、道具、整体透视与自然动作。
- 点亮物理输出、显示桌面、固定光标；隐藏、待命、编辑各预热 4 秒，再采样 12 秒。
  前后分别刷新 Plasma，确认日志出现 `Eyes GPU wallpaper loaded` 和
  `Eyes Rive wallpaper loaded ... dpr=2`。
- 临时给 Plasma 启用 `QSG_RHI_PROFILE=1` 和 `QSG_RENDER_TIMING=1`，从 Qt
  `last retrieved GPU frame time` 日志取实际壁纸窗口的硬件时间。待命前/后分别有
  670/735 个 GPU 样本，编辑前/后分别有 547/736 个样本。编辑帧率取
  `DebugPerformance` 的五秒模型采样。GPU 查询结果可能滞后几个帧，参见
  [Qt 时间戳说明](https://doc.qt.io/qt-6/qrhicommandbuffer.html#lastCompletedGpuTime)。
- 初次采样时屏幕自动熄灭，GPU 计数没有增长；该组数据全部排除。熄屏时共享模型
  仍可能报告 60 FPS，所以仅凭模型帧率无法证明壁纸正在提交 GPU 工作。

这是同一台机器上的短时对照，GPU 频率和其他桌面活动仍可能影响数值。
[结构化结果](2026-10-30-render-batching.json)保存了样本数、均值、中位数和 P95。
采样完成后关闭壁纸性能日志、移除临时环境并刷新 Plasma，恢复用户隐藏和原壁纸。

## 改动与画质检查

上游桥接为每个小形状开启一个独立绘制通道，每次都处理整张 MSAA 目标。
现在仅合并连续、使用 source-over、且完整裁切几何完全相同的路径，避免重复的
整张纹理解析。切换裁切或进入道具层时仍重新清理模板；每个形状的绘制顺序、
缓冲、着色器和混合方式不变。背景磨砂继续使用原有静态缓存。

在独立 D-Bus 与虚拟 KWin 中使用真实 GPU，比较优化前后 **140 张画面的全部 RGB
像素，差异为零**：28 种状态，每种覆盖静态、自然动作、光标转向、眨眼及淡出。
截图为 DPR=2、2232×1400；XWayland/离屏截图未用于替代这组 Wayland GPU 对照。
另外保留真实 GPU 的亚像素边缘覆盖、清晰轮廓、等厚笑眼、高光、道具和透明混合回归，
并加强“放大镜在眼面上不被前一高光模板遮住”的断言。

最终验证：`npm test` 83 项通过，`npm run check`、`npm run desktop:build`、
`npm run desktop:install` 通过；隔离虚拟 KWin 下的 `npm run desktop:test`
304 项通过；安装后 `eyes status` 确认用户隐藏仍有效。

## 复测入口

真实壁纸复测需在物理输出点亮时进行。给 Plasma 临时启用上述 Qt 环境变量后刷新
服务，在相同状态、屏幕、光标与帧率配置下采样，完成后移除变量并再次刷新服务。
`DebugPerformance` 只提供模型节奏，GPU 时间需要读取 Qt 的硬件时间戳。

另提供不会安装、默认不构建的独立测量工具：

```bash
cmake --build build --target eyes-render-benchmark -j2
QT_QUICK_BACKEND=rhi QSG_RHI_BACKEND=opengl \
  build/eyes-render-benchmark "$PWD/tools/render-benchmark.qml"
```

工具预热两秒，随后输出 GPU 均值、中位数、P95、实际窗口尺寸、DPR 和帧率；
不支持硬件时间戳时会明确失败。为两版分别保留构建目录，将同一份 QML 的 import
指向对应 `wallpaper-ui`，保持窗口尺寸与 DPR 相同。可在独立虚拟 KWin 内运行以免
在主桌面打开测试窗口。独立工具只测眼睛场景，不能替代上面的真实壁纸测量。

实现约束见 [ADR-014](../decisions/014-batch-compatible-vector-passes.md)。
