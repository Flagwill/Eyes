# Claude Code 联动

Eyes 通过 Claude Code 官方 lifecycle hooks 接入本机 Claude Code。Claude Code 与 Codex 的 hook 载荷同形（`session_id`、`hook_event_name`、`tool_name`、`tool_input`、`tool_use_id`），所以状态机、工具识别、防抖与用户隐藏保护只在 Codex 适配器里维护一份（见 [CODEX.md](CODEX.md)）；Claude 适配器只把差异翻译过去。

## 安装

```bash
npm run claude:hooks:install    # 或运行 packaging/install-user.sh，它会一并调用
```

安装器把下列文件放进 `~/.claude`（或 `CLAUDE_CONFIG_DIR`），并把 Eyes 条目合并进 `settings.json` 的 `hooks`：

| 文件 | 作用 |
| --- | --- |
| `hooks/eyes-claude-hook.py` | Claude 事件 → 共享引擎词汇的翻译层 |
| `hooks/eyes_hook_engine.py` | `integrations/codex/eyes-codex-hook.py` 的同源副本（共享状态机） |
| `settings.json` | 合并 `hooks`；旧 Eyes 条目先移除再追加，其余键与其他工具的 hooks 原样保留，权限位保持不变 |

未显式指定目录且 `~/.claude` 不存在时安装器跳过，不为没有 Claude Code 的机器创建目录。`settings.json` 不是合法 JSON 时拒绝写入。已运行的 Claude Code 会话需重启（或在 `/hooks` 中确认）才会加载新 hooks。

## 事件映射

| Claude Code hook | Eyes 状态 |
| --- | --- |
| `SessionStart`（`startup\|resume\|clear\|fork`） | `idle`；`compact` 不匹配，避免压缩时收起画面 |
| `UserPromptSubmit` | `activity listening` |
| `PreToolUse` | 按工具名与结构化输入选择 `activity ID` |
| `PermissionRequest`、`Notification`（`permission_prompt\|elicitation_dialog`） | `waiting` |
| `PostToolUse` | 恢复仍在运行的工具；全部结束后 `thinking` |
| `PostToolUseFailure` | 视作结构化失败：`debugging`，同类再次启动 `retrying`，连续两次 `blocked` |
| `PostToolUseFailure` 且 `is_interrupt` | 等价 Codex 的 `Interrupt`：清空状态并 `waiting` |
| `PreCompact` / `PostCompact` | `summarizing`，之后恢复仍在运行的动作 |
| `SubagentStart` / `SubagentStop` | `delegating`，全部结束后总结 |
| `Stop` | `complete` |
| `StopFailure` | `waiting`（回合因限流或 API 错误中止，不显示完成） |
| `SessionEnd` | `idle` |

`idle_prompt` 通知不接入：它在回合完成很久后才触发，会把已淡出的 Eyes 重新叫出来。

工具名映射：`Agent`/`Task` → 委派，`TodoWrite`/`TaskCreate`/`TaskUpdate`/`EnterPlanMode`/`ExitPlanMode` → 计划，`AskUserQuestion` → 等待，`WebSearch`/`WebFetch`/`LSP` → 搜索，`NotebookEdit` → 编辑，`PowerShell`/`Monitor` → 运行；`Read`/`Write`/`Edit`/`Grep`/`Glob`/`Bash`/`Skill` 与 `mcp__*` 由共享分类器直接识别。其余未知工具显示 `tool`。

## 约束

- 适配器**从不输出任何内容**：`SessionStart` 的 stdout 会被注入模型上下文。所有异常被吞掉，退出码恒为 `0`，不影响 Claude Code 的工具权限。
- 尊重 `$XDG_STATE_HOME/eyes/user-visibility`：`eyes hide` / `eyes quit` 后不连接 socket、不启动宿主（见 [ADR-011](decisions/011-user-visibility-intent.md)）。
- 只看工具名和结构化字段，不读命令输出、transcript 或模型推理，不保存路径、命令或响应内容。
- 并行会话（Codex 与 Claude Code 同时运行）共用一个 Eyes 宿主，后到的状态覆盖先到的。会话按 `session_id` 哈希分别保存状态。
- 子智能体工具调用携带同一 `session_id`，会驱动同一画面。
- `Stop` 在模型向用户提问时也会触发，Eyes 可能先显示完成再被下一条消息唤回。
- Claude Code 的 hook 载荷字段以官方文档为准；`Notification` 的类型过滤主要依赖 settings 的 matcher。

## 跟随哪一个 Agent

适配器给每个事件打上 `source: claude` 标记。用户在托盘右键菜单选择“跟随 Agent”后，共享引擎只处理被选中那一路的事件，Claude Code 的事件照常送达但不再改变画面；未选择时默认跟随全部。
