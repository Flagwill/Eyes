# Codex Desktop 联动

Eyes 通过 Codex 官方 lifecycle hooks 接入本机 Codex，不依赖 Codex Desktop 的私有 IPC。用户级配置位于 `~/.codex/hooks.json`，所有事件都交给 `~/.codex/hooks/eyes-codex-hook.py`，由适配器调用现有的 Eyes 本地 socket。

## 事件映射

| Codex hook | Eyes 状态 |
| --- | --- |
| `SessionStart` | `idle` |
| `UserPromptSubmit` | `activity listening` |
| `PreToolUse` | 根据工具名称与结构化输入选择对应的 `activity ID` |
| `PermissionRequest` | `waiting` |
| `PostToolUse` | 恢复仍在运行的工具；全部结束后 `thinking`，结构化失败时 `activity debugging` |
| `PreCompact` / `PostCompact` | 压缩前后显示 `activity summarizing`；压缩完成后恢复仍在运行的动作 |
| `SubagentStart` / `SubagentStop` | `activity delegating`，全部子智能体结束后进入总结/思考 |
| `Interrupt` | `waiting` |
| `Stop` | `complete` |
| `SessionEnd` | `idle` |

Codex 0.149 支持 `Interrupt`、压缩与子智能体事件；用户级配置已接入这些事件。会话结束或进程正常退出时由 `SessionEnd` 收起画面。

适配器按会话保存活动工具 ID、子智能体 ID、最近一次结构化失败的类型与连续失败次数，以及去重和抖动抑制所需的最近命令。并行的 `PreToolUse` / `PostToolUse` 会恢复仍在运行的动作，不会提前切回思考；同类工具在失败后再次启动会显示 `activity retrying`，成功完成后清除重试上下文。同类动作连续失败两次会显示 `activity blocked`，等待下一次尝试或用户介入。每个新工具动作都会立即显示；约 0.3 秒内紧跟的“恢复外层工具”或“切回思考”会被合并，避免一次写文件刚显示 `creating` 就被外层 shell 的 `running` 覆盖。等待权限、失败、重试、总结、阻塞、完成和结束也始终立即显示。重复状态不会重播动画。没有 ID 的调用与子智能体调用独立配对。旧状态文件会自动迁移。所有异常都被吞掉并以退出码 `0` 结束，不会阻塞或改变 Codex 的工具权限。

## 工具动作识别

| 工具或可见意图 | 工作状态 |
| --- | --- |
| 创建文件、仅新增文件的 `apply_patch` | `creating`，新纸与加号 |
| 编辑文件、更新/混合补丁 | `editing`，纸笔 |
| 读取文件、`cat` / `sed` / `head` | `reading`，逐行扫视与纸张 |
| 搜索、`rg` / `grep` / `find`、Web 搜索 | `searching`，探看与放大镜 |
| Shell / `exec_command` | `running`，迷你终端 |
| 明确的测试命令，例如 `npm test` / `node --test` | `testing`，勾选框 |
| MCP 工具、包装器内明确的 MCP 调用 | `mcp`，连接节点 |
| 读取 `SKILL.md`、明确的 skill 工具 | `skill`，小手册 |
| 计划、委派、请求输入 | `planning` / `delegating` / `waiting` |
| `git diff` / `show` / `log`，`git add` / `commit` | `reviewing` / `saving` |
| 未知工具 | `tool`，小扳手 |
| 结构化错误响应 | `debugging`，查看出错环节 |
| 失败后启动同类工具 | `retrying`，回顾后再次尝试 |
| 同类动作连续失败两次 | `blocked`，申请换路或用户帮助 |
| 上下文压缩、全部子智能体结束 | `summarizing`，汇拢线索 |
| 用户中断 | `waiting`，收住动作等待下一步 |

只检查工具名称及结构化操作字段，绝不执行输入内容。状态文件仅保存工具 ID、状态名、子智能体 ID、失败状态名与计数，不保存文件路径、命令、代码、工具响应或 skill 正文。只在响应明确提供 `isError: true`、`is_error: true`、`success: false`、非零 `exit_code` / `exitCode` 或失败 `status` 时显示排错，不通过输出中的文字猜测失败。`Stop` 会清空工具与子智能体状态并进入 `complete`；4.5 秒淡出计时仍由 Eyes 宿主维护，后续 `status` 查询不会取消它。

`functions.exec` 包装器可识别明确的嵌套工具名称及简单的 `cmd` 字面量；复杂脚本、多种并行操作、变量拼接、命令别名或封装工具中的实际语义不能可靠推断。优先显示可确认的类别。需要精确表现其他内部阶段时仍可由 harness 显式调用 `eyes activity ID`；hook 不读取 transcript，也不根据模型私有推理猜测活动。完整状态见 [README](../README.md) 与 [动作台本](MOTION.md)。

Hook 使用同步模式，因为 Codex 会并发启动同一事件及相邻事件的 command hooks。适配器本身只做一次短 socket 写入；如果 Eyes 后台尚未运行，则安静地启动它。改成后台 hook 反而可能让 `PostToolUse` 早于 `PreToolUse` 更新状态。

## 启用

1. 正常运行 Eyes 的用户安装流程，或执行 `npm run codex:hooks:install`。
2. 打开 `/hooks` 查看信任状态；若显示 `untrusted` 或 `modified`，先审查并信任。
3. 若 hook 内容发生变化，新建线程让当前会话加载新配置。

安装器复制可执行适配器并原子写入 `~/.codex/hooks.json`。它会移除旧 Eyes 条目后追加当前定义，同时保留其他 hooks、顶层字段和事件；重复执行是幂等的。适配器优先使用 `~/.local/bin/eyes`，因此不依赖某个仓库仍存在。若设置了 `CODEX_HOME`，安装路径和 hook 命令都会跟随该目录。

不要同时在仓库 `.codex/hooks.json` 留下项目级副本。Codex 会合并用户级与项目级 hooks，同一事件将执行两次。

## 已知限制

- `Stop` 也会在模型结束本轮并向用户提问时触发，因此 Eyes 可能先显示完成，再由下一条用户消息切回好奇。
- 重试由失败后启动的同类工具识别，属于可见行为提示，不代表 Codex 已公开“正在调试”的内部意图。
- 托管工具（例如 WebSearch）不经过本地 `PreToolUse` / `PostToolUse`；需要这些阶段时由明确的活动入口报告。
- 若 Codex 异常退出而没有触发 `SessionEnd`，适配器会保留一个按会话哈希命名的小状态文件；文件仅含上述非内容元数据并限制为 `0600`。
- 多个同时运行的 Codex 会话共用一个 Eyes 桌面宿主，后到的状态会覆盖先到的状态；当前目标是一个项目会话的视觉反馈。
- Cloud 或远程执行环境里的 hooks 无法自然驱动本机 Eyes。
- Hook 首次新增或修改后必须重新在 `/hooks` 中审查；未信任时 Codex 会跳过它。安装器修改 `~/.codex/hooks.json` 会改变被审查的内容。
- 本接入不改变 Eyes 的壁纸插件、安装方式或权限边界。
