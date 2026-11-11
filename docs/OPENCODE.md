# opencode 联动

Eyes 通过 opencode 的插件 API 接入本机 opencode。opencode 没有 Codex / Claude Code 那样的 hook 载荷，所以状态机、工具识别、防抖与用户隐藏保护仍然只在 Codex 适配器里维护一份（见 [CODEX.md](CODEX.md)）；opencode 适配器只把插件事件翻译过去，再交给共享引擎。

## 安装

```bash
npm run opencode:plugin:install    # 或运行 packaging/install-user.sh，它会一并调用
```

安装器把下列文件放进 `~/.config/opencode/plugins/eyes/`：

| 文件 | 作用 |
| --- | --- |
| `index.ts` | opencode 插件：订阅事件与工具钩子，翻译成共享引擎词汇 |
| `eyes-bridge.mjs` | 事件投递桥：串行化事件、启动引擎进程、保证宿主收尾不吞事件 |
| `eyes_hook_engine.py` | `integrations/codex/eyes-codex-hook.py` 的同源副本（共享状态机） |

opencode 只从 `~/.config/opencode/plugins/` 加载插件，不认 `OPENCODE_CONFIG_DIR`；未显式指定目录且该目录不存在时安装器跳过，不为没有 opencode 的机器创建目录。已运行的 opencode 服务会在下次加载插件时生效，重新启动 opencode 即可确认。

## 事件映射

| opencode 事件 | Eyes 状态 |
| --- | --- |
| `session.execution.started` | `activity listening` |
| `session.execution.succeeded` | `complete` |
| `session.execution.failed`、`session.execution.interrupted` | 等价 Codex 的 `Interrupt`：清空状态并 `waiting` |
| `session.idle` | 回合结束的兜底：仍在执行中才补 `complete` |
| `permission.asked` | `waiting` |
| `session.compaction.started` / `session.compaction.ended` | `summarizing`，之后恢复仍在运行的动作 |
| `session.deleted` | `idle` |
| `ctx.tool.hook("execute.before")` | 按工具名与结构化输入选择 `activity ID` |
| `ctx.tool.hook("execute.after")` | 恢复仍在运行的工具；全部结束后 `thinking`；工具报错则 `debugging`，同类再次启动 `retrying`，连续两次 `blocked` |

工具名映射：`shell`/`bash` → 运行，`read` → 阅读，`write` → 创建，`edit` → 编辑，`grep`/`glob`/`webfetch` → 搜索，`todowrite` → 计划，`task` → 委派，`mcp__*` → MCP；其余未知工具显示 `tool`。工具名与结构化字段之外的内容一律不读。

## 约束

- 适配器**从不输出任何内容**：插件在 opencode 进程内运行，stdout 会污染用户界面。所有异常被吞掉，不影响 opencode 的工具权限与模型请求。
- 尊重 `$XDG_STATE_HOME/eyes/user-visibility`：`eyes hide` / `eyes quit` 后不连接 socket、不启动宿主（见 [ADR-011](decisions/011-user-visibility-intent.md)）。
- opencode 会在同一进程内多次求值插件模块并多次调用 `setup()`。插件用 `globalThis` 单例守卫保证只有一份订阅；桥接层的事件队列也挂在 `globalThis` 上，跨实例串行，避免多个引擎进程争抢同一个会话锁。
- opencode 结束一次运行时会给整个进程组发 `SIGTERM`。引擎收到终止信号时先把当前事件处理完再退出；桥接层用 `detached` 启动引擎，使宿主的收尾不会吞掉正在投递的事件。
- 引擎默认连接 `$XDG_RUNTIME_DIR/eyes.sock`，可用 `EYES_CODEX_SOCKET` 覆盖；`EYES_HOOK_ENGINE` 可指定另一个引擎脚本。
- opencode 的事件流包含所有项目与会话的事件。适配器按 `session_id` 维护各自的状态，互不干扰。
- 多个 opencode 实例（后台服务与 `--standalone` 私有服务）会同时驱动同一块壁纸，后到的状态覆盖先到的。
