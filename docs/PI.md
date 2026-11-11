# Pi 联动

Eyes 通过 Pi 的扩展 API 接入本机 Pi。Pi 的生命周期事件名与 Codex / Claude Code 不同，所以状态机、工具识别、防抖与用户隐藏保护仍然只在 Codex 适配器里维护一份（见 [CODEX.md](CODEX.md)）；Pi 扩展只把事件翻译过去，再交给共享引擎。

## 安装

```bash
npm run pi:extension:install    # 或运行 packaging/install-user.sh，它会一并调用
```

安装器把下列文件放进 `~/.pi/agent/extensions/eyes/`：

| 文件 | 作用 |
| --- | --- |
| `index.ts` | Pi 扩展：订阅生命周期事件，翻译成共享引擎词汇 |
| `eyes-bridge.mjs` | 事件投递桥：串行化事件、启动引擎进程、保证宿主收尾不吞事件 |
| `eyes_hook_engine.py` | `integrations/codex/eyes-codex-hook.py` 的同源副本（共享状态机） |

Pi 从 `~/.pi/agent/extensions/` 自动发现扩展，也可放在项目里的 `.pi/extensions/`。未显式指定目录且 `~/.pi/agent` 不存在时安装器跳过，不为没有 Pi 的机器创建目录。

Pi 在会话开始时读取扩展。安装扩展之前就已经打开的 Pi 会话仍然带着旧的扩展集合，不会把事件送到引擎，眼睛也就没有反应；在那些会话里执行 `/reload`（或重启 Pi）即可生效。安装器在装完后会提示这一点。`/reload` 会重新加载扩展、技能与提示词，Pi 在模型回复进行中会拒绝执行并提示等待。

## 事件映射

| Pi 事件 | Eyes 状态 |
| --- | --- |
| `session_start` | `idle` |
| `before_agent_start` | `activity listening` |
| `tool_call` | 按工具名与结构化输入选择 `activity ID` |
| `tool_result` | 恢复仍在运行的工具；全部结束后 `thinking`；工具报错则 `debugging`，同类再次启动 `retrying`，连续两次 `blocked` |
| `agent_settled`（未中止） | `complete` |
| `agent_settled`（`aborted`） | 等价 Codex 的 `Interrupt`：清空状态并 `waiting` |
| `session_before_compact` / `session_compact` | `summarizing`，之后恢复仍在运行的动作 |
| `session_shutdown` | `idle` |

工具名映射：`bash`/`powershell` → 运行，`read` → 阅读，`write` → 创建，`edit`/`multi_edit` → 编辑，`grep`/`glob` → 搜索，`find` → 搜索，`web_search`/`web_fetch` → 搜索，`todo` → 计划，`agent`/`task` → 委派，`mcp__*` → MCP；其余未知工具显示 `tool`。工具名与结构化字段之外的内容一律不读。

## 约束

- 适配器**从不输出任何内容**：扩展在 Pi 进程内运行，stdout 会污染用户界面。所有异常被吞掉，不影响 Pi 的工具权限与模型请求。
- 尊重 `$XDG_STATE_HOME/eyes/user-visibility`：`eyes hide` / `eyes quit` 后不连接 socket、不启动宿主（见 [ADR-011](decisions/011-user-visibility-intent.md)）。
- Pi 会话 id 由 `ctx.sessionManager.getSessionId()` 提供；扩展拿不到会话 id 时不投递事件，不会误报状态。
- Pi 可能重建扩展运行时。扩展用 `globalThis` 单例守卫保证同一进程只投递一份；桥接层的事件队列也挂在 `globalThis` 上，跨实例串行，避免多个引擎进程争抢同一个会话锁。
- 引擎收到终止信号时先把当前事件处理完再退出；桥接层用 `detached` 启动引擎，使 Pi 的收尾不会吞掉正在投递的事件。
- 引擎默认连接 `$XDG_RUNTIME_DIR/eyes.sock`，可用 `EYES_CODEX_SOCKET` 覆盖；`EYES_HOOK_ENGINE` 可指定另一个引擎脚本。

## 跟随哪一个 Agent

扩展给每个事件打上 `source: pi` 标记。用户在托盘右键菜单选择“跟随 Agent”后，共享引擎只处理被选中那一路的事件，Pi 的事件照常送达但不再改变画面；未选择时默认跟随全部。

选择“Pi”只对真正把事件送达引擎的 Pi 会话有效。扩展尚未被加载的 Pi 会话不会产生事件，跟随哪一个 Agent 都看不到它的反应；先 `/reload` 再选择。
