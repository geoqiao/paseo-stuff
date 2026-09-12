# Paseo pet

安静的 Agent 侧边宠物面板，直接使用本机 Codex pet 包。版本 **0.1.1**，验证目标为 Paseo app/daemon/SDK **0.8.0**。

不改聊天时间线、Tool call display、审批或 Agent 行为。没有系统桌面悬浮窗、声音、自动弹出、全局鼠标跟踪，也不默认添加 composer pill。

## 使用

1. 在 Paseo 中选中一个 Agent，按 **⌘K**，选择 **Open Pet**。面板出现在 Explorer 侧边。
2. 首次使用点击 **Open pet settings**，进入独立设置页。点击 **Use Codex location**，检查所选 host 上的目录，再点击 **Save folder**。也可填写其他绝对路径。
3. 在设置页选择宠物，然后返回 Agent 的 Pet 面板。常驻面板只展示宠物、简短状态和右上角设置图标；点击宠物或聚焦后按 Enter 暂停/恢复。
4. 设置图标或全局 **Pet settings** 命令进入独立管理页。选宠、**Refresh**、动画开关、**Change folder → Forget folder** 都在这里；不会与宠物动画同时渲染，不删除任何资源文件。

全局 **Pet settings** 命令也可打开配置。根目录、选中宠物及动画开关是 **host 级设置**，该 host 的授权客户端共享，并在重载、禁用/启用后保留。面板跟随其关联 Agent 的状态；选择宠物不是逐 Agent 独立配置。

新安装默认目录为空，不扫描 home。建议路径为 daemon 机器上的 `${CODEX_HOME:-$HOME/.codex}/pets`。远程 daemon 无法直接读取当前手机/电脑上的目录；首版不做上传或同步。

## Codex 兼容

每个包为根目录下的一个子文件夹：

```text
pets/my-pet/
├── pet.json
└── spritesheet.webp
```

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A small companion.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

| 版本 | 图片尺寸 | 网格 |
| --- | --- | --- |
| v1，版本缺省或 1 | 1536 × 1872 | 8 × 9 |
| v2，必须显式为 2 | 1536 × 2288 | 8 × 11 |

- 单格为 192 × 208。接受静态 PNG / WebP，保留原图，不转换或写回。
- 按 Codex 帧表播放 idle、running、waiting、review、failed，只使用有效帧。
- v2 后两行视线方向保留在资源中，首版不启用视线跟随。
- 缺省版本不会按图片尺寸猜成 v2；未知版本、错尺寸和动态图会报错。
- 资源来源：Codex 本地包契约和 hatch-pet 帧表；插件不包含 Codex 代码或用户角色素材。资源许可与本插件 MIT 许可分开。

## 状态与低干扰

- 启动/运行 → Working 动画。
- 等待权限/需要输入 → waiting。
- 已完成且需要查看 → review。
- 错误 → failed。
- 空闲 → idle；关闭/快照不可用 → 静止 idle 与明确状态文字。
- 权限等待优先于错误；不自动批准、清除 attention 或发送消息。
- 系统 reduced-motion、手动暂停、应用后台或零尺寸隐藏面板时停止逐帧计时，显示 idle 首帧。
- 深浅主题使用宿主颜色，窄屏使用紧凑布局。按钮支持键盘和可访问标签。
- 图片 source、回调和样式保持稳定；只更新独立裁剪层的 transform，不逐帧重新加载 atlas 或重绘设置界面。保留原帧表的逐格节奏，不生成插值帧或声称 60 fps。

## 资源与安全边界

插件属于 Paseo 的可信、无沙箱代码，不把下列校验误认为操作系统沙箱：

- 后端仅三个读操作 RPC：默认目录建议、包列表、选中 atlas 加载。无 shell、网络请求、后台目录监听或启动扫描。
- 只读给定根目录内的 pet.json 和 manifest 指向的图片；拒绝路径穿越、绝对/URL atlas 路径及包内符号链接。用户选择的根目录本身可解析为 canonical 路径。
- 文件以只读描述符打开，检查普通文件、前后身份/时间/大小、realpath 边界并限制读取量。缓解文件替换竞态，但不是针对同权限恶意进程的强隔离；仍应只使用可信目录。
- manifest 上限 **16 KiB**，atlas 上限 **8 MiB**。校验 PNG CRC/容器、WebP 容器与尺寸，拒绝 APNG / animated WebP；最终像素解码失败在 UI 显式报告。
- 列表最多 128 个有效包、扫描最多 512 个目录项；异常包单独报错，同名/同 id 不覆盖其他包。
- 列表只读 manifest、图片头和文件信息，不加载所有图片。选中后经现有 Paseo RPC 一次传输 atlas 的 data URI；不逐帧传图、不额外开 HTTP 服务。
- 资源 revision 检测文件变化；内容哈希标识已加载图片。客户端请求缓存不保留未使用 atlas 查询；宿主图片解码缓存仍由宿主管理。
- 每个面板只渲染一个选中 atlas，v2 单张 RGBA 解码约 13.4 MiB。
- 所有已获 daemon 管理权限的客户端共享此插件能力；RPC 根目录不是额外的用户权限 ACL。
- 不复制、上传、修改或再分发用户现有 pet 文件。截图和测试使用原创几何图形。

## 开发与安装

```sh
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm run check
paseo plugin install /absolute/path/to/paseo-stuff/plugins/paseo-pet --host 127.0.0.1:6767
paseo plugin ls paseo-pet --host 127.0.0.1:6767 --json
```

安装前按 Paseo 的信任模型审查源码和全局插件开关。不要为本插件重启 daemon。

运行中的插件源码修改后需先检查，再 `paseo plugin reload paseo-pet --host ...`；设置保存则即时生效，无需重载。**若插件已停用，保持停用，除非用户明确要求启用。**

测试使用[原创几何资源生成器](tests/fixtures.ts)，不附带或再分发用户的 Codex pet 包。
工作区的历史记录与本机预览工具不属于此次公开内容；下方明确区分离线检查与实机验证。

当前 **74 项测试**、类型检查、lint、已安装宿主的离线编译器、独立浏览器交互/性能回归通过。本地插件保持用户选择的 **disabled** 状态；0.1.1 未在实际 Paseo 重载或启用，因此尚未验证新 UI 的宿主跳转和实际会话负载下的流畅度。0.1.0 的桌面联调是历史记录，不作为新版体验保证。真实 iOS/Android、远程加密 relay 和全部实际 Agent 状态的端到端测试仍未完成。
