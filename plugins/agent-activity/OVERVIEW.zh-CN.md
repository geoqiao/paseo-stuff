Readable Agent Activity 把 Paseo 的工具调用行换成可展开的卡片，用格式化并带语法高亮的 JSON 显示 Input 和 Output，并给 Thinking 行配上风格一致的紧凑标题栏。长输出只预览前二十行，点 Show all 可以展开全部。消息、审批和输入框保持原生显示。

请在 Full detail 模式下使用这些卡片。卡片会绕过 Summary 分组，所以切换到 Summary 之前，请在该客户端的 Command Center 里运行 "Activity: use native tool rows (for Summary)"；要切回卡片时，运行 "Activity: use tool cards (Full detail)"。这个选择只对当前客户端生效，插件每次重新加载后都会恢复为卡片。

插件完全在客户端运行，只重新排版 Paseo 已经收到的数据，不生成摘要，也不重建 diff。它没有网络、文件系统、进程或 daemon 端的行为。对非常大的内容点 Show all 可能会比较慢。

不要和其他替换工具调用或 Thinking 时间线条目的插件同时启用。插件要求 Paseo 0.13.0 或更新版本。自动化检查在 Paseo 0.13.2 SDK 下通过，最近一次实测是在 Paseo 0.13.2 daemon 和 0.13.2 网页客户端上。Paseo 桌面应用以及原生 iOS 和 Android 未经测试。本插件 fork 自 Matt Cowger 的 Colorful Agent Activity。
