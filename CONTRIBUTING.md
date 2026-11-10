# 贡献指南

本指南适用于 [ForsakenDelusion/magpie-agentrouter-plus](<https://github.com/ForsakenDelusion/magpie-agentrouter-plus>)，不是上游仓库。开始前阅读 [使用说明](<README.md>)、[设计与兼容边界](<docs/OPTIMIZATION.md>) 和 [来源记录](<UPSTREAM.md>)；安全漏洞按 [安全政策](<SECURITY.md>) 私密报告。

仓库目前私有，访问、分支与 PR 操作需要相应授权。不要为了提交贡献公开仓库、账户配置或私有安装包。

## 从 Issue 到 Pull Request

1. 先搜索本仓库已有 Issue。缺陷提供合成输入的最小复现；功能建议先说明问题、范围和兼容影响，较大改动先与维护者讨论。
2. 从本仓库最新 `main` 创建独立功能分支；有相应权限时可使用 fork。一个 PR 聚焦一个问题，不夹带无关格式化、生成物或本地配置。
3. PR 目标为 `ForsakenDelusion/magpie-agentrouter-plus` 的 `main`。上游改动与本项目改动分开归因，不能把上游 Issue 编号当成本仓库编号。
4. 标题使用 `type(scope): 简短说明`。支持 `feat`、`fix`、`docs`、`test`、`refactor`、`perf`、`build`、`ci`、`chore`、`revert`；scope 可省略，用小写模块名；破坏性变更用 `!` 并说明迁移。例如 `fix(request): 保留纯文本历史 phase`。
5. 正文使用 `Refs #123` 关联真实的本仓库 Issue，或以 `Fixes #123` 表示合并后关闭它；不要保留示例编号。

填写 `## 改动说明`、`## 验证证据`、`## 风险与兼容性`，不能只有模板注释。说明为什么改、改了什么、刻意不改什么、如何验证以及证据边界。

## 本地验证

使用 Node.js 20 或更新版本与 Python 3.12+，在仓库根目录运行：

```bash
npm test
npm run test:policy
npm run test:headers
npm pack --dry-run
```

- 测试使用合成数据与离线网络桩，不需要真实账号／Cookie，不调用正在运行的 Magpie。
- 记录实际 Node.js／Python／OS 版本、执行命令、结果与相关反例。未运行的项目写明原因，预期结果不能写成通过；不以测试数量代替契约覆盖。
- `test:policy` 只检查 PR 元数据规则，不是业务或安全语义验证。打包预检须确认运行时模块齐全且无敏感／本地数据。
- 真实 provider 测试可能消耗免费额度或产生费用，需要部署者明确授权；不能将上游历史测试或离线通过写成本 fork 的线上恢复／性能证据。

CI 定义包含 Ubuntu／Windows 的 Node.js 20、22、24 矩阵。本地测试与 GitHub 矩阵执行分别报告，不能只测试一个版本就声称全平台通过。

## 兼容与安全要求

- 对纯文本 assistant 使用明确的 `EasyInputMessage content:string`，保留角色、`phase` 与精确字符顺序。拒绝、真实注释、非空／未知概率、媒体和未知消息字段不能被压成普通文字。
- 不删除不透明 reasoning、加密状态、工具 `call_id`／结果、引用或其他历史状态来制造成功；原生 ID-only 引用也是服务端上下文。无法证明无损时保留输入或明确报错。
- 不新增自动请求重试、失败后的自动重放或有损故障转移。已有完整历史内联不是重新发送一次失败请求。
- 每次模型 fetch 的端点在异步处理前固定；设置变更只影响后续请求。保留高级覆盖顺序与旧配置，不静默清空地址或切换账户站点／签到。
- 模型 key、管理令牌、Cookie 与 OAuth 不混用，不跨非预期来源转发凭据；URL 校验是安全边界，不是 WAF 绕过。
- 日志、错误、补丁、测试夹具、截图与分发包不得含真实凭据、认证头、词表或用户对话。检查新增测试是否真的失败于旧实现，而不是仅改旧测试预期。
- 继承或复用代码时更新 [UPSTREAM.md](<UPSTREAM.md>)，保留适用的版权与 MIT 声明；不要修改已经固定的 [上游 README 快照](<docs/UPSTREAM-README.md>) 来冒充原始来源。

提交前检查并勾选 PR 中的声明：

- [ ] 我确认未提交真实凭据、Cookie、Token 或用户对话。

## 自动化与人工审查

`CI gate` 汇总矩阵结果，`PR policy` 检查标题、Issue、正文和敏感信息声明，CodeQL 提供静态分析。它们不自动批准／合并，不替代人工语义与安全审查。私有仓库的权限、Actions 可用性和 fork 执行审批须按 GitHub 实际状态核对，不能靠模板推断已生效。

[CODEOWNERS](<.github/CODEOWNERS>) 指定 `@ForsakenDelusion`。建议对 `main` 设置必需检查、合格审查者批准、代码所有者审查、更新后撤销过期批准并解决审查对话；**这是维护要求，不是对当前 GitHub 保护规则已启用的声明**。

维护者自己的 PR 不能以自审代替独立审查。只有一位代码所有者时，应安排其他合格审查者并核对仓库规则；如确需紧急管理员绕过，记录原因、风险、验证证据和补审安排，不让机器人代批，不静默关闭保护。
