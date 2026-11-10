# 版本记录

[使用说明](<README.md>) · [优化设计与兼容边界](<docs/OPTIMIZATION.md>) · [上游来源](<UPSTREAM.md>)

本页记录 `magpie-agentrouter-plus` 的源码变化，当前版本 **0.2.0**；**尚未发布 npm 包**，本仓库目前私有。源码、本地 tarball、GitHub 分支和宿主实际加载版本应分别核对。历史上游记录不代表本 fork 的发布、线上验证或性能结论。

## 0.2.0 — 源码版本，未发布 npm

- 包名改为 `magpie-agentrouter-plus`，维护入口为 `ForsakenDelusion/magpie-agentrouter-plus`，开发分支 `main`；保留完整上游历史和 MIT 原署名。provider ID 仍为 `agentrouter`，声明模型仍为 `gpt-5.6-sol`、`gpt-6-astra`、`gpt-6.1-sol`。旧新插件不可同时加载。
- 新增布尔选项 `use-domestic-api`，默认 `true` 为国内 `https://ps.air-outer.com/v1`，`false` 为国际 `https://agentrouter.org/v1`。每次模型 fetch 在异步正文处理前固定选择，缓存 loader／模型的下一次请求仍能切换；进行中的请求不切换，模型列表在下一次读取时生效。
- 显式高级配置顺序为有效 `account.endpoint > provider.endpoint > account.apiBase > provider.apiBase > use-domestic-api`。`endpoint` 只补一次 `/v1`，`apiBase` 是完整前缀；旧覆盖值不自动清空。非法／含 URL 凭据的地址和未知模型请求来源被安全拒绝，不静默改投另一端。
- 账户站点、OAuth、余额、签到和既有累计消耗 fallback 不随模型 API 开关改变；不迁移账号，不自动启用签到。双端选择不是 WAF 绕过，也不增加额度。
- 进一步修复纯文本 assistant 历史：证明为普通 `output_text`／`input_text` 的数组按原序精确拼接为 `EasyInputMessage` 的 `content: string`，保留 `role`／`phase`，移除输出外壳 `type`／`id`／`status`。覆盖旧数组及无 ID 形态，避免形成缺少原生必需字段的半截输出消息。
- 真实注释、非空／未知概率数据、`refusal`、混合媒体、未知字段、不透明 reasoning、工具关联和仅引用历史不被降级或丢弃。原生 ID-only 引用同样阻止请求级历史内联；不新增自动重试或失败后裁剪重放。
- 离线回归检查实际 `auth.loader.fetch` 路径，区分旧安装包 0.1.6、上游基线与本项目新的纯文本输入契约；补充动态端点和保留性反例。**本 fork 未运行消耗额度的真实推理测试，未测量延迟／吞吐改善**；不声称上游服务恢复。
- 安装说明以完整本地目录／tarball 为准，明确替换旧 provider 与宿主认证保留的不确定性；新增来源记录，保留逐字节上游 README 快照。

## 继承的上游未发布修复

固定基线为 [`42779f501b35028557696f3a0e83a4dc3267602b`](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/tree/42779f501b35028557696f3a0e83a4dc3267602b>)，其 package 版本仍为 0.1.6；以下是上游源码行为，不等于已安装的同版本 npm 包：

- 修复 Windows 内置 Administrator 在 CI 中被 `icacls` 记作 `LA`、导致安全目录被误拒绝的问题：使用当前完整 SID 的原生 ACL 往返结果识别身份，保留共享权限拒绝策略和 Linux 权限检查；补充跨平台权限与域 SID 反例测试。
- [上游 Issue #2](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/issues/2>)／[PR #3](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/pull/3>)：完整 assistant 历史内联后保留 `output_text` 及空 `annotations`／`logprobs`，不误转其他角色的 `input_text`。未引入 reasoning 裁剪；推理 ID、加密内容、仅引用和未知字段继续保留。本项目 0.2.0 在其角色修复之上进一步改为明确的纯文本 EasyInputMessage。

## 上游历史版本

以下日期、测试数量与发布描述保留为上游历史记录，未作为本 fork 的当前验证或 registry 复核结果。

### 0.1.6 — 2026-11-06

- 登录顺序保持 API Key 在前、GitHub 在后。API Key 无插件问题，只用宿主原生单输入；保存不代表验证。当前宿主 API `authorize` 不接收原生 key，因此不添加保存前验证、第二个 key 字段、verified 标记或状态徽章。
- GitHub 仅预先询问系统访问令牌（遮蔽输入），随后由用户浏览器授权、回填完整回调 URL，再查找已有模型 key。管理令牌不是模型 key；不是免令牌或全自动 OAuth。
- 首次登录移除端点、站点、请求头、用户 ID、用户名密码及 Cookie 问题。新账号默认 `agentrouter.org`；升级保留旧账号 key、site 和其他既有设置，不做自动迁移。
- 已有 key 查找兼容已知 `data.items` / `data` 数组形状；候选须启用（`status=1`）、非空、未掩码、未过期，按 key 去重后必须唯一。多个候选、无候选、未知响应或分页截断不确定时要求手动 API Key 恢复，不自动创建、轮换、重试，也不以空 key 完成 OAuth。
- loader 对缺失 key 或保留占位 key 在网络前返回本地 `400 agentrouter_missing_api_key`。
- 文档移除旧首次登录问题清单，区分保存、模型测试、账号余额与签到；宿主“已登录”不代表模型已验证。高级 metadata 仍可通过既有手动配置维护；插件选项仅支持布尔开关，没有新增 Cookie 设置页。
- npm 安装说明固定到 0.1.6，要求先查询官方 registry 并核对宿主实际加载版本；继续原本地目录注册的用户不要重复添加 npm 插件。本地原生回归 278 项 Node.js、2 项 Python 通过；离线验证不代表真实授权或模型已验证。
- 不改变限流、Responses 兼容、过滤或签到运行逻辑；独立 [本地签到工具](<LOCAL-CHECKIN.md>) 保持不变，不自动启用。

### 0.1.5 — 上游记录为已发布

- 新增内部共享有界读取器：请求保持 **4 MiB / 2 秒**，JSON 响应诊断限制为 **64 KiB / 2 秒**。检查副本，不消费原正文；无法可靠读取或解析时放弃改写。
- 在明确错误封套内新增有限的数字状态、错误码与繁忙短语分类；每层验证错误叶子，只继承合法数字状态，深度预算耗尽时透传。认证、权限、余额、配额及内容策略等业务原因优先，不误包装成暂时性故障。
- 保留既有 token 限流、内容拒绝、跨资源历史和空完成专用类型；保留上游错误代码/消息、等待头和请求标识。新增分类不自行设置通用等待时间，也不添加重试。
- SSE 保持 **64 KiB / 15 秒** 前导边界，改为增量分行；兼容混合换行、跨块 UTF-8、多行 data 和重复 event 最后值。遇有效内容或未知事件/形状即停止诊断，保留原始字节、取消、背压及在途读取。
- 独立文本过滤支持普通 `output_text.logprobs: []`，无论历史内联是否开启；关闭内联时只替换文本，不删 ID、类型或元数据。非空/未知概率数据、真实注释、工具及不透明状态继续保留。
- 修复重复过滤时可能跨越已有过滤标记或吞掉代码结构分隔符的问题，保留下一非空行缩进；加强 Markdown 边界与幂等性回归。
- 选项、默认值、公开根入口、登录配置与依赖不变。本地原生验证为 **255 项 Node.js + 2 项 Python** 通过，并获独立范围复核接受；不构成线上恢复保证。

参考 MIT 项目 [AgentRouter-Codex-Filter](<https://github.com/alexcarterio/AgentRouter-Codex-Filter>) 的离线 V12.2 源码 ZIP 所体现的保守诊断思路，**独立实现插件行为**；未核验远端提交，不移植其独立代理、仪表盘、遥测、多层自动重试或有损历史清理。详细取舍见 [优化说明](<docs/OPTIMIZATION.md>)。

### 0.1.4

以下登录问答为历史行为，已由 0.1.6 的简化流程替代；不是当前版本的操作步骤。

- GitHub 登录先选择站点，系统访问令牌使用遮蔽输入；签到续期默认跳过，仅主动配置时显示 GitHub Cookie 获取说明与本地格式校验。格式通过不代表线上有效，普通登录无需配置签到续期。
- 修复完整普通历史消息带空 `logprobs: []` 时未能参与内联重放的问题；保留工具关联、非空或未知概率数据、引用注释、推理/加密及其他不透明状态。
- 明确历史兼容边界：仅对已有完整内联内容的适用条目去除资源本地 ID，不恢复仅存在于其他上游资源的历史或加密状态，不把这一补充描述为跨资源问题的通用解法。

0.1.4 的空概率数组修复针对**历史内联**；0.1.5 进一步补齐**独立文字过滤**路径，两者不是同一项改动。
