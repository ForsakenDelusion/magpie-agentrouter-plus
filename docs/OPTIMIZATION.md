# 0.2.0 设计与兼容边界

[使用说明](<../README.md>) · [版本记录](<../CHANGELOG.md>) · [上游来源](<../UPSTREAM.md>) · [MIT 许可](<../LICENSE>)

本文描述 `magpie-agentrouter-plus` 0.2.0 的本地行为契约，不是性能基准或上游可用性报告。本项目尚未发布 npm 包；仓库目前私有，安装使用完整本地目录或核对过的 tarball。本 fork 未运行消耗额度的真实推理测试，合成回归不能证明账号、额度、WAF 或两端渠道可用。

## 模型端点的选择与生效时点

`use-domestic-api` 使用宿主支持的布尔选项接口，没有新增任意文本设置页：

| 值 | 默认／含义 | API 基址 |
| --- | --- | --- |
| `true` | 默认，国内 CN | `https://ps.air-outer.com/v1` |
| `false` | 国际 INTL | `https://agentrouter.org/v1` |

旧宿主未提供选项读取器时仍使用默认国内端；是否能在面板操作这个选项，须核对宿主版本。

- loader 的 `baseURL` 是创建时的值，SDK／模型实例可能缓存它。
- 每次实际模型 fetch 都重新读取选项，并在异步正文检查前固定目标端点。来自旧 SDK 基址的合法请求可映射到本次所选基址，保留路由后缀与请求查询参数。
- 设置在下一次 fetch 生效，不改变已开始的请求；修改开关不会额外发送请求，也不会自动重试或故障转移。
- 模型列表在下一次实际读取时使用相同选择，不保证宿主界面缓存立即刷新。
- 这仅是推理端点选择，不是迁移账号、增加免费额度或解除服务商限制。

### 高级覆盖顺序

第一个适用的高级地址优先于开关：

```text
account.endpoint > provider.endpoint > account.apiBase > provider.apiBase > use-domestic-api
```

账号读取兼容平铺字段与 `metadata`；有值的平铺字段优先。`endpoint` 表示根地址／前缀，末尾没有 `/v1` 才追加；`apiBase` 是完整 API 前缀，不自动追加版本；尾部斜杠规范化，不生成 `/v1/v1`。

合法的显式自定义 HTTP(S) 来源、端口和路径前缀也可以使用，它们是部署者主动给予的信任配置。**旧覆盖值不会自动清除。** 要改用布尔开关，须先备份，再主动清除账号及 provider 中不再需要的 `endpoint`／`apiBase`，不能误删 key、账户站点或 Cookie。

无 scheme 的旧误填值（例如曾误存的模型 key）忽略后继续找下一项；显式非法／不安全 URL 则拒绝，不悄悄换到下一地址或默认端。不能把“无 scheme 的旧值兼容”扩大成任意非法 URL 都可回退。

## 端点与凭据边界

实现见 [endpoints.mjs](<../endpoints.mjs>) 及 [index.mjs](<../index.mjs>)：

- 高级地址必须是合法 HTTP(S)，不得带用户名、密码、查询、片段、空白或反斜杠。密钥不能出现在 URL 中；配置错误只给固定提示，不回显原值。
- 实际模型请求 URL 必须位于当前配置基址、loader 初始配置基址，或两个已知 HTTPS `/v1` 前缀下；路径边界按完整前缀匹配，不以相似域名或字符串包含关系授信。
- 未知来源／不合法请求返回本地 `400 agentrouter_untrusted_request_url`；非法配置使用 `agentrouter_invalid_endpoint`。拒绝发生在读取请求正文、发送模型 key 或联网之前；loader 创建时的配置解析也可能直接报错。
- 跨来源映射移除 `Cookie`、`Cookie2`、`Proxy-Authorization`、`New-Api-User`，避免把原站点／代理凭据带到另一个模型前门；模型 Authorization 最终由模型 key 设置。模型列表没有调用方 URL 的凭据作用域，因此始终移除这四种头，保留适用的公开头与模型 key；账户站点、余额／签到和既有消耗 fallback 不变。
- 支持的 Request 改道保留方法、正文、Headers、取消 signal 及适用的 Fetch 属性；只改目标和明确授权的正文／头字段。正文检查读取副本，实际发送仍按原生 fetch 消费正文，不承诺 fetch 后原 Request 还能再次读取。
- **仅在需要改道、仍继承原 Request 正文且有效 `keepalive:true` 时**，本地返回 `400 agentrouter_unsupported_request_transport`，不发送上游请求。原生 Fetch 无法可移植地用继承的流式正文重建这种 Request；插件不为路由无界读取正文，也不静默清除 `keepalive`。同 URL 的原生透传、无正文 Request、显式／准备后的字符串 `init.body`，以及有效 `keepalive:false` 仍支持。遇到该错误，应由调用方主动提供可序列化的字符串 `init.body`，或选择原生支持的传输配置；不要为了成功默默更改已有标志。

当前接入与传输验证范围为 Node.js 离线回归及 smoke，不代表浏览器 Fetch 或正在运行的 Magpie 已完成验收。

这些是 URL 与凭据作用域的安全约束，不是 WAF 绕过、服务商授权证明或通用网络沙箱。显式自定义 HTTP 地址不提供 HTTPS 的传输保护；只在你有权且信任的环境中配置。

## Assistant 历史输入契约

固定上游基线 [`42779f5`](<https://github.com/ZhaoJun233/agentrouter-magpie-plugin/tree/42779f501b35028557696f3a0e83a4dc3267602b>) 比已安装的上游 0.1.6 包多了角色区分修复：assistant 不再沿其他角色的路径误转 `input_text`。但仅保留 `output_text` 数组并删除输出消息 ID，仍可能留下不满足原生输出消息必需 `id`／`status` 的半截对象。

0.2.0 不保留这层有歧义的输出外壳。对已证明为普通文本的 assistant，选择明确的 `EasyInputMessage` 字符串形式：

```json
{
  "type": "message",
  "id": "msg_synthetic_example",
  "status": "completed",
  "role": "assistant",
  "phase": "final_answer",
  "content": [
    { "type": "output_text", "text": "第一段", "annotations": [], "logprobs": [] },
    { "type": "input_text", "text": "\n第二段" }
  ]
}
```

变为以下输入消息（示例均为合成数据）：

```json
{
  "role": "assistant",
  "phase": "final_answer",
  "content": "第一段\n第二段"
}
```

判断与改写约束：

1. 普通消息只接受已知外层字段；文本片段只能是 `input_text`／`output_text`，且 `text` 为字符串，其他获准字段仅为缺省或空数组的 `annotations`／`logprobs`。
2. 按原数组顺序精确拼接，不插入、删除或整理空格／换行。移除 `type`／`id`／`status`，保留 `role` 和原 `phase`。旧 `input_text` 数组和无 ID 的普通数组同样适用。
3. 已是无输出外壳的纯字符串 assistant 不为格式化而重写。实际内联发生时才设置 `store:false`，并清理失效的正文长度／摘要头。
4. 非空、`null` 或形状未知的注释／概率字段，`refusal`，媒体、签名或其他未知消息字段不获得字符串降级资格。

实现见 [request.mjs](<../request.mjs>)，契约回归见 [history-protocol.test.mjs](<../history-protocol.test.mjs>) 与 [request-replay.test.mjs](<../request-replay.test.mjs>)。原生消息／工具类型可参考 [OpenAI EasyInputMessage](<https://github.com/openai/openai-python/blob/main/src/openai/types/responses/easy_input_message_param.py>) 和 [工具输入定义](<https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_function_tool_call_param.py>)；协议可接受的输入形式不等于服务商承诺跨资源加密状态可用。

## 必须保留的历史状态

`portable-responses` 仅处理完整、形状已知的普通消息及 function-call／function-call-output 的内联内容。工具的 `call_id`、名称、参数、结果及嵌套业务 ID 不改，不因一次失败裁剪工具链。

保留规则优先：

- 带 `previous_response_id`、`conversation`、显式 `item_reference` 或原生 `{ "id": "…" }` 引用时，整条请求不做历史 ID 内联；不能把它当成可丢弃的空消息。
- reasoning 的 ID、摘要、`encrypted_content`、compaction 及未知条目不删除。真实注释、拒绝、非空概率数据和媒体不被压成普通文本。
- `store:false` 不会解密别的资源的状态，也不补齐引用背后的正文。
- 若独立开启文字过滤，它仍可替换符合条件的可见正文，但不访问引用背后的历史，不修改不透明状态。

只有服务端引用的旧会话仍须原资源，或由客户端提供完整内联历史。升级、切换端点、换 key 或删除状态都不是无损恢复保证；本插件不内置“失败后删历史再发一次”策略。

## 正文选项与处理顺序

| `portable-responses` | `text-filter` | 请求正文行为 |
| --- | --- | --- |
| 开 | 开 | 先过滤获准正文，再按条件内联完整历史 |
| 开 | 关 | 不过滤，只做符合条件的历史内联 |
| 关 | 开 | 只过滤；不做历史 ID／输出外壳改写 |
| 关 | 关 | 不做这两项正文变换 |

两个正文开关和 `send-codex-headers` 均默认开。全部关闭正文变换也不等于旁路认证头处理、端点路由或响应诊断；没有实际变换时不为 JSON 格式化重新序列化。

本地词表由 [content-filter.mjs](<../content-filter.mjs>) 从插件安装目录的 `content-filter.local.json` 加载，格式见 [示例](<../content-filter.example.json>)。不存在／空词表不替换；已有配置不可读、非法或超限时报告配置错误，不静默忽略坏词表。词表是加载快照，修改后须重新加载，不能把它与每次 fetch 读取的端点开关混为一谈。

过滤只处理获准的普通正文、`instructions` 和字符串 `input`；不猜测厂商词表、不自动学习私人请求、不探测或追加重试。工具参数／结果／schema、附件、模型名、metadata、不透明状态及被保护的 Markdown 代码不处理。它不是通用脱敏或数据防泄漏系统，保留内容仍可能触发服务商拒绝。

## 有界请求与响应诊断

以下能力继承自上游，不作为 0.2.0 的性能改进宣称：

| 对象 | 字节上限 | 检查等待上限 | 范围 |
| --- | --- | --- | --- |
| 请求正文 | 4 MiB | Request 副本读取 2 秒 | `POST .../responses` 的可解析 JSON |
| JSON 响应 | 64 KiB | 2 秒 | HTTP 200／400／429 的适用错误诊断 |
| SSE 前导 | 64 KiB | 15 秒 | HTTP 200 SSE，尚未放行有效内容或未知事件 |

请求超限、取消、压缩、非 JSON、UTF-8／读取失败或其他端点不改写；请求查询参数仍由端点映射保留。共享读取器见 [body-inspection.mjs](<../body-inspection.mjs>)。

[response.mjs](<../response.mjs>) 只从明确错误封套及有限白名单分类，不从正常正文或工具结果搜错误词。认证、权限、余额、配额和内容策略等业务原因优先；未知结构和预算外数据保留原始响应。SSE 支持混合换行与跨块 UTF-8；遇有效正文、推理、工具内容或未知事件／形状即停止诊断，后续字节、取消与背压继续传递，不全量缓存回答。

明确早期失败可被规范化为 JSON 错误，已输出部分内容后的错误不重新包装；不因 HTTP 200 或零用量假定成功。上游等待头和请求标识按既有逻辑保留，只有已识别的 token 速率错误在没有等待头时补 `Retry-After: 60`；这只是建议，不保证一分钟恢复。

这些预算不是整段响应大小、进程内存或总请求时长的上限，也不是延迟／吞吐更快的证据。一次模型 fetch 至多一次上游 fetch，本地缺 key／不安全地址拒绝时为零；宿主自身的重试、路由与账号切换是另一层策略，须单独核查。

## 登录、账户和签到

- API Key 使用宿主原生单输入，保存不验证；管理令牌、余额读取成功或宿主显示已登录都不等于模型可用。
- GitHub 仍需系统访问令牌、用户浏览器授权和完整手动回调。只取唯一可用的已有模型 key；无唯一候选、列表不完整或未知形状时要求手动恢复，不自动创建、轮换或补页重试。
- 新登录账号的账户站点仍默认 `org`。`site`／`siteURL` 控制 OAuth、账户网页、余额与签到，不随模型 API 布尔开关改变；既有 key-billing 消耗 fallback 保留独立的国际默认，不读取此开关。
- 签到续期是已有可选能力，不随安装或切换启用。GitHub Cookie 是高权限登录会话，不能混用为模型 key，服务器也不保证能通过 WAF。授权确认、2FA、验证码或账号不匹配需要人工处理。
- 余额可能是宿主缓存的历史读数。签到的明确结果、账户余额和模型调用分开验证，不将消耗当剩余额度。

独立工具见 [LOCAL-CHECKIN.md](<../LOCAL-CHECKIN.md>)，其运行逻辑未因本次 fork 改变；上游详细登录与签到说明保留在 [文档快照](<UPSTREAM-README.md>)，涉及旧包名／安装步骤时以当前 [README.md](<../README.md>) 为准。不要在 Git、工单、截图、命令行或日志中放真实会话与认证配置。

## 升级与回退

1. 核对本仓库 `main`、包名／版本和实际提交；0.2.0 未发布 npm，不能用上游包名安装本 fork。私有仓库访问、tarball 来源和宿主加载结果分别确认。
2. 在受保护的位置备份完整旧插件、宿主管理的认证／选项及私有词表，备份不要进仓库或安装包。
3. 核实当前 Magpie 的单插件停用／替换及认证保留机制。旧包和本 fork 都注册 `agentrouter`，不能同时加载；**未确认宿主行为前，不假设卸载会保留认证。** 本文不提供未经确认的强制卸载步骤。
4. 按 [README](<../README.md#安装与替换旧插件>) 选择完整本地目录或 tarball。不能仅覆盖 [index.mjs](<../index.mjs>)；相邻运行模块包括新增的 [endpoints.mjs](<../endpoints.mjs>)，均须随包交付。
5. 更新已注册目录后按宿主支持的方式重新加载，核对实际加载路径／版本。插件不自动迁移 key、site 或旧 URL；要使用双端开关，主动清除两层不再需要的显式覆盖，保留其他字段。
6. 使用合成输入验证开关、协议与保留性。真实 `magpie provider test agentrouter` 可能消耗免费额度或产生费用，须由部署者确认；无需通过生产对话、自动签到或真实 Cookie 验证本地回归。
7. 完整回退须恢复此前核对过的整套包和受保护的配置，重新加载，不混用新旧模块。回到上游 0.1.6 会失去本项目动态双端和纯文本输入修复；仅关闭正文选项不能回退端点与其他功能，也不能恢复已缺失历史。

## 本地验证

使用 Node.js 20 或更新版本与 Python 3.12+，从仓库根目录运行：

```bash
npm test
npm run test:policy
npm run test:headers
npm pack --dry-run
```

CI 定义面向 `main`，包含 Ubuntu／Windows 的 Node.js 20、22、24 矩阵；本地某个版本通过不等于所有矩阵已执行，GitHub Actions 与仓库保护状态须另行核对。记录实际版本和结果，不沿用上游测试数量，也不把合成回归写成付费模型测试。

重点验收项：

- loader 实际发出的 assistant 是保留 `role`／`phase` 的字符串输入；精确字符顺序、无 ID 数组与原生 ID-only 引用均有反例。
- 真实注释、`null`／非空概率、拒绝、媒体、未知字段、reasoning 和工具关联不因升级丢失。
- 默认、切换、缓存 loader、多实例与在途请求使用正确端点；高级优先级、URL 安全、Request 正文／Headers／signal／查询完整。
- 开关不改变账户站点／签到／消耗 fallback；不安全地址不发送模型 key，也不读正文。
- 两个正文开关独立，未改写字节保留；响应早期／后期错误、超限、慢流、取消与背压不被伪造为成功。
- 打包清单包含全部运行时依赖及许可，排除账号、词表、日志、用户对话和本地生成物。

协议回归采用合成输入检查已安装上游 0.1.6、固定上游源码与本项目；两份旧实现的角色／输入形式边界不同，不能把它们都描述为本项目已修复的同一个线上根因。完整测试结果以本次实际执行日志为准。

## 不提供的保证

- 不保证 CN／INTL 两端恢复、免费规则不变、模型有可用渠道，或 WAF 不再拦截。
- 不增加额度／速率容量，不自动重试，不保证宿主一定遵循等待头。
- 不恢复仅存于其他资源的引用或加密状态，不裁剪历史制造成功。
- 不保证所有响应错误能分类，也不声称词表是完整审核词表或通用 DLP。
- 不声称延迟、吞吐、模型质量改善；没有本 fork 的真实推理或性能基准证据。
- 不因本地源码、包版本或 GitHub 仓库已存在就宣称 npm 发布、用户部署升级、CI／保护规则已生效或账户已验证。
