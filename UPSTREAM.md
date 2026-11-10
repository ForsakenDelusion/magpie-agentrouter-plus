# 上游来源与维护边界

[使用说明](<README.md>) · [版本记录](<CHANGELOG.md>) · [MIT 许可](<LICENSE>)

## 来源

| 项目 | 记录 |
| --- | --- |
| 本仓库 | [ForsakenDelusion/magpie-agentrouter-plus](<https://github.com/ForsakenDelusion/magpie-agentrouter-plus>)，目前为私有仓库 |
| 本项目包名／源码版本 | `magpie-agentrouter-plus`／`0.2.0`；尚未发布 npm 包 |
| 上游 | [ZhaoJun233/agentrouter-magpie-plugin](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin>) |
| 固定基线 | [`42779f501b35028557696f3a0e83a4dc3267602b`](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/tree/42779f501b35028557696f3a0e83a4dc3267602b>) |
| 上游原包名／版本 | `opencode-agentrouter-auth`／`0.1.6`；基线还含上游未发布改动，不能把版本号当作代码完全一致的证明 |
| 本地 Git 关系 | 保留完整上游历史及 `upstream` remote；本仓库开发分支为 `main` |
| 许可与署名 | MIT；保留 `Copyright (c) 2026 ZhaoJun233`，本项目改动署名 `ForsakenDelusion` |

本项目不是上游的官方发行，也不代表 AgentRouter 服务商。GitHub 仓库地址存在、包版本已修改或本地安装包已生成，都不等于 npm 已发布、源码已部署到用户的 Magpie 或模型服务已验证可用。

## 上游基线与安装包不是同一个状态

固定基线包含上游对 [Issue #2](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/issues/2>)／[PR #3](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/pull/3>) 的角色区分修复：assistant 历史不再被当成其他角色转换为 `input_text`。上游保留了 reasoning、加密状态、引用与未知字段，没有采纳裁剪 reasoning 来换取成功的做法；基线也包含 Windows Administrator ACL 身份识别修复。

这些是**上游源码中继承的改动**，并不证明已安装的上游 0.1.6 npm 包含有它们。本项目进一步修正纯文本 assistant 的输入形式，而不是只复制角色区分补丁。

## 本项目新增的行为

- 对证明为普通文本的 assistant 数组，以原序精确拼接为 `EasyInputMessage` 的 `content: string`，保留 `role`、`phase`，移除输出消息外壳的 `type`／`id`／`status`；同时覆盖无 ID 和旧 `input_text` 数组。不会留下缺少原生必需字段的输出消息。
- 真实注释、非空／未知概率数据、拒绝、混合媒体、未知消息、工具关联、不透明 reasoning 和仅引用历史保持原有语义。原生 ID-only 引用同样阻止请求级历史内联。
- 增加 `use-domestic-api`：默认国内 CN，关闭为国际 INTL。每次模型 fetch 在异步处理前固定端点；下一次 fetch 可使用新设置，即使 loader／模型已缓存。
- 保留高级配置的显式优先级，不静默删除旧覆盖地址。模型 API 与账号站点／余额／签到独立；非法 URL 与未知请求来源不会因切换获得凭据。
- 包名与维护入口归本仓库；provider ID 和三个声明模型名保持不变。不新增自动重试、失败重放、独立代理或有损历史降级。

详细契约及限制见 [OPTIMIZATION.md](<docs/OPTIMIZATION.md>)。离线 loader／fetch 回归支持上述本地行为，不证明真实上游恢复或性能更快；本 fork 尚未进行消耗额度的真实模型测试。

## 上游文档快照

[UPSTREAM-README.md](<docs/UPSTREAM-README.md>) 是[固定提交中的上游 README](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/blob/42779f501b35028557696f3a0e83a4dc3267602b/README.md>) 的逐字节副本，创建前确认目的文件不存在，且与当时未修改的本地 [README.md](<README.md>) 一致：

```text
来源：42779f501b35028557696f3a0e83a4dc3267602b:README.md
字节数：46602
SHA-256：59abe8eeb80ab74c5773aa065283074b85eb780ac9c38d4fd909426237c29bb4
```

快照不追加横幅，以便核验原始字节。它保留旧包名、上游安装步骤和带日期的服务实验，**不是本 fork 的安装指南或当前线上事实**；请以本仓库 [README.md](<README.md>) 为准。相对链接也保留原目标，部分在当前快照位置不能解析；需要跟随原文链接时，请查看上面固定提交的上游原文。上游历史变更在 [CHANGELOG.md](<CHANGELOG.md>) 中单独归因。

上游优化文档曾记录对 MIT 项目 [AgentRouter-Codex-Filter](<https://github.com/alexcarterio/AgentRouter-Codex-Filter>) 离线 V12.2 ZIP 的设计参考，未核验远端提交；本 fork 不将其代理、遥测、多层重试或有损清理描述为自己的新增实现，也不声称重新验证了该历史参考资料。

## 后续同步约定

1. 记录每次采用的上游 commit，而不是仅比较包版本号；评审差异、许可和适用范围。
2. 区分原样继承、修改适配与本项目独立新增的行为，保留原作者署名；不覆盖已固定的文档快照。
3. 上游更新后重新运行合成回归和完整安装包检查，重点核对历史状态、端点与凭据边界，不沿用旧测试数量或上游线上结果。
4. 发布与部署由维护者另行决定。当前安装路径为完整本地目录或核对过的 tarball，不在文档中预设 npm、GitHub Release 或用户环境已更新。
