# Eyes 渲染开销：窗口 DPR 目标、Rive 回调、裁切缓存与仿真

2026-11-02，Radeon 680M 集成显卡。对照组为提交 `9d09ecb` 的构建（ADR-015 之后）。
设计与约束见 [ADR-016](../decisions/016-window-ratio-target-and-frame-cpu.md)。

## 结果

编辑状态、60 FPS 配置、KDE 缩放 1.4（`Screen.devicePixelRatio=2`，窗口实际 1.4）。
前后各 6 轮交替运行，取均值；CPU 以一个逻辑核心为 100%，并按实测帧率折算成每帧毫秒。

| 指标 | 改动前 | 改动后 | 变化 |
| --- | ---: | ---: | ---: |
| 每帧 CPU（全部线程） | 4.21 ms | 3.20 ms | −23.9% |
| 其中渲染线程 | 2.30 ms | 1.46 ms | −36.5% |
| 其中主线程 | 1.38 ms | 1.19 ms | −13.6% |
| 平均 GPU 帧时间 | 2.71 ms | 1.48 ms | −45.3% |
| GPU 帧时间 P95 | 3.39 ms | 2.03 ms | −40.1% |
| GPU 引擎时间 / 帧 | 2.78 ms | 1.57 ms | −43.5% |
| 进程 GPU 驻留内存 | 565 MiB | 326 MiB | −239 MiB（−42.4%） |

说明：

- 测试期间桌面有其他负载，实际帧率在 34–51 FPS 间波动（两组都受影响），所以
  用“每帧毫秒”而非百分比比较；原始逐轮数据见
  [结构化结果](2026-11-02-render-cost.json)。
- 独立窗口测量只含眼睛场景；不含 Plasma 壁纸容器的磨砂缓存与 KWin 合成。真实桌面
  的绝对数字不同，趋势应一致，但**尚未在真实 Plasma 桌面复测**。
- 一个不绘制任何内容、仅按 60 FPS 提交帧的窗口，本身约占 6.6% CPU、3.6% GPU
  引擎（改动前测得），这是本方案无法再降的基线。

## 改动

1. **目标尺寸改用窗口实际 DPR。** 缩放 1.4 时 `Screen.devicePixelRatio` 被取整为 2，
   而窗口按 1.4 渲染。旧版本按 2 分配 8× 多重采样目标，面积约为需要的 2 倍。
   现在使用 Qt 6.11+ 的 `Window.devicePixelRatio`，缺失时回落到屏幕 DPR。
2. **跳过混合动画的回调扫描。** 采样显示渲染线程约 37% 的忙时花在 140 个零权重动画的
   `reportKeyedCallbacks` 上。素材没有 Rive 事件，因此在构建目录的补丁头文件里不再
   传入回调接收器；动画照常推进和应用。测试保证素材的任何表情都不上报事件。
3. **裁切三角网格缓存。** 每个被裁切的高光/反光原本都会重新三角化整只眼的轮廓。
   现按整个裁切栈（路径与矩阵，按值比较）缓存，命中返回的顶点与重算逐位一致。
4. **仿真去分配与静止弹簧快速返回。** 预计算 140 个 Rive 输入名；静止在目标上的弹簧
   直接返回（1e-9 内吸附）。

## 画质与正确性检查

- `npm test` 87 项、`npm run check`、桌面构建、`eyes-geometry-test`、完整 Qt GPU
  回归 304 项均通过。
- 在独立 KWin 中采集 112 张真实 GPU 画面（28 种状态 × 两个静止时刻、光标转向、眨眼；
  共 1.48 亿像素）：
  - 同一构建重复采集：**0** 个像素不同，渲染具有确定性。
  - 仅 Rive 插件改动（第 2、3 项）：**0** 个像素不同。
  - 仅仿真改动（第 4 项）：**0** 个像素不同。
  - 目标改为窗口 DPR（第 1 项）：1.55% 像素不同，最大单通道差 77/255，最大值出现在
    眨眼细线帧。睁眼轮廓同样清晰、仍为一像素抗锯齿；闭眼细线在个别帧会略淡或略宽，
    取决于亚像素相位。这是从“2× 超采样再下采样”变为“原生密度”的结果。
- 仿真数值对照：全部 28 种状态、5,040 帧（含光标、注视、眨眼与中途切换），Rive 输入
  最大差 1.1e-8（输入范围 0–100），姿态最大差 9.7e-10。
- `scene.rml`（Rive 素材源文件）改动前后逐字节相同（5,058,893 字节），所以 `.riv`
  不变；本机没有 Rive CLI，仅同步 `manifest.json` 的 `sourceHash`。

## 开源调研

核实的是“零混合权重动画是否仍被推进”：上游 rive-cpp 的
[Event fixes 提交](https://skia.googlesource.com/external/github.com/rive-app/rive-cpp/+/aec4c7c4038ea001c25b0da8022c14a25545f8ef)
明确写明混合状态必须在 mix 为 0 时继续 `advance`，以便事件上报，并只在部分嵌套路径
跳过 `apply`；未发现已合并的“关闭事件上报”选项，因此采用本地带保护的补丁。
遮挡暂停（被最大化窗口盖住时停止动画）不采用：用户的窗口带模糊/半透明，需要透过它
看到 Eyes，且实测 KWin 不会对被遮挡窗口限流。

## 复测方法

```bash
S=$(mktemp -d)            # 独立的 XDG_CONFIG_HOME，避免 KWin 把虚拟输出写进 ~/.config
XDG_CONFIG_HOME=$S dbus-run-session -- kwin_wayland --virtual --socket eyes-bench \
  --width 2240 --height 1400 --exit-with-session ./bench-wrapper.sh
# wrapper：WAYLAND_DISPLAY=eyes-bench；先 kscreen-doctor output.Virtual-0.scale.1.4，
# 再运行 build/eyes-render-benchmark，并从 /proc/<pid>/task/*/stat 与 fdinfo 取样。
```

必须使用独立的 `XDG_CONFIG_HOME`：KWin 会把虚拟输出（`Virtual-0`）的缩放写入
`~/.config/kwinoutputconfig.json`，并让之后的虚拟会话沿用，进而改变 DPR 假设。

## 未验证

- 真实 Plasma 桌面（含磨砂缓存与 KWin 模糊合成）的前后对比。
- 低采样显卡、其他分数缩放（1.25、1.5、1.75）与 Qt < 6.11 的回落路径。
- 三角化精度（4096）、MSAA 档位与帧率策略不在本次范围内。
