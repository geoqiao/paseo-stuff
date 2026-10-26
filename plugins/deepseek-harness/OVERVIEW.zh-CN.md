DeepSeek Harness 为 Paseo 添加一个 provider，让你在 daemon 所在的机器上，通过官方 DeepSeek Harness 命令行工具（`dsh`）运行 agent。对话显示在 Paseo 普通的 agent 视图里，插件没有自己的界面。这是社区插件，不是 DeepSeek 或 Paseo 的官方产品。

daemon 所在的机器上必须已经安装、登录并配置好 DeepSeek Harness，并且 `dsh` 要在 daemon 的 `PATH` 中，或者通过 Paseo 的 provider `command` 覆盖设置指定。如果 `dsh` 报告的版本低于 0.1.5-rc.1，或者无法读取版本，provider 会显示为不可用，并给出原因。插件还要求 Paseo 0.11.0 或更新版本，以及 daemon 上的 Node.js 22.19.0 或更新版本。插件不会安装或配置 `dsh`。模型和推理强度的选项来自 `dsh` 报告的模型，所以会跟随你的 DeepSeek Harness 配置。

如果你从 0.1.0-beta.12 或更早的版本升级，请注意插件不再读取 `DSH_PASEO_COMMAND` 和 `DSH_PASEO_PROFILE` 环境变量。请把这些值移到 Paseo 的 provider 命令覆盖设置，也就是 daemon `config.json` 里的 `agents.providers.deepseek-harness.command`，写成一个数组，例如 `["/opt/dsh/bin/dsh", "--profile", "acp"]`。这个数组会替换整条默认命令，所以要保留一个使用 ACP 的 `--profile`。

Usage 面板显示你的 DeepSeek API 余额。为了查询余额，插件按 `dsh` 相同的方式读取 API key：先读环境变量，再读 `~/.dsh/.credentials.yaml` 或 `~/.dsh/.env`，并且只把 key 发送到 DeepSeek 的余额接口。

每个 agent 会话都以你的操作系统用户身份，作为子进程运行 `dsh --profile acp`，使用 daemon 的环境变量加上该会话的环境变量。这些环境变量里的凭据都会传给 `dsh`。插件本身不添加沙箱或权限策略。对 DeepSeek 服务的调用由 `dsh` 自己发出。

恢复会话时，插件请求 `dsh` 恢复它自己的上下文。如果恢复失败，插件会报告错误，不会新开一个会话。`dsh` 不会重放旧消息，所以在 agent reload 或 daemon 重启之后，agent 仍然记得对话，但时间线是空的。插件不支持 provider 斜杠命令、steering 和计划，Paseo 额外的系统提示词也不会传给 `dsh`。列出模型时，可能会在 `dsh` 的会话列表里留下空会话。

自动化检查在 Paseo 0.11.4 和 0.13.2 SDK 下通过。真实对话在 macOS 上的 Paseo 0.11.4、0.12.0-beta.2、0.13.0 和 0.13.2 daemon 上运行过，最近一次使用 DSH 0.2.1-rc.3。Windows 以及原生 iOS 和 Android 客户端未经测试。
