# Codex Desktop 联动

Eyes 通过 Codex 官方 lifecycle hooks 接入本机 Codex，不依赖 Codex Desktop 的私有 IPC。用户级配置位于 `~/.codex/hooks.json`，所有事件都交给 `~/.codex/hooks/eyes-codex-hook.py`，由适配器调用现有的 Eyes 本地 socket。

## 事件映射

| Codex hook | Eyes 状态 |
| --- | --- |
| `SessionStart` | `idle` |
| `UserPromptSubmit` | `start` |
| `PreToolUse` | `working` |
| `PermissionRequest` | `waiting` |
| `PostToolUse` | 仍有并行工具时 `working`，最后一个结束后 `thinking` |
| `Stop` | `complete` |
| `SessionEnd` | `idle` |

Codex 0.149 的 hook 协议没有中断事件，因此不使用 `Interrupt`。会话结束或进程正常退出时由 `SessionEnd` 收起画面。

适配器按会话保存活动工具集合。并行的 `PreToolUse` / `PostToolUse` 不会让画面在工作与思考之间来回闪烁；重复状态也不会重播动画。所有异常都被吞掉并以退出码 `0` 结束，不会阻塞或改变 Codex 的工具权限。

Hook 使用同步模式，因为 Codex 会并发启动同一事件及相邻事件的 command hooks。适配器本身只做一次短 socket 写入；如果 Eyes 后台尚未运行，则安静地启动它。改成后台 hook 反而可能让 `PostToolUse` 早于 `PreToolUse` 更新状态。

## 启用

1. 正常运行 Eyes 的用户安装流程，或执行 `npm run codex:hooks:install`。
2. 打开 `/hooks` 查看信任状态；若显示 `untrusted` 或 `modified`，先审查并信任。
3. 若 hook 内容发生变化，新建线程让当前会话加载新配置。

安装器复制可执行适配器并原子写入 `~/.codex/hooks.json`。它会移除旧 Eyes 条目后追加当前定义，同时保留其他 hooks、顶层字段和事件；重复执行是幂等的。适配器优先使用 `~/.local/bin/eyes`，因此不依赖某个仓库仍存在。若设置了 `CODEX_HOME`，安装路径和 hook 命令都会跟随该目录。

不要同时在仓库 `.codex/hooks.json` 留下项目级副本。Codex 会合并用户级与项目级 hooks，同一事件将执行两次。

## 已知限制

- `Stop` 也会在模型结束本轮并向用户提问时触发，因此 Eyes 可能先显示完成，再由下一条用户消息切回好奇。
- 多个同时运行的 Codex 会话共用一个 Eyes 桌面宿主，后到的状态会覆盖先到的状态；当前目标是一个项目会话的视觉反馈。
- Cloud 或远程执行环境里的 hooks 无法自然驱动本机 Eyes。
- Hook 首次新增或修改后必须重新在 `/hooks` 中审查；未信任时 Codex 会跳过它。安装器修改 `~/.codex/hooks.json` 会改变被审查的内容。
- 本接入不改变 Eyes 的壁纸插件、安装方式或权限边界。
