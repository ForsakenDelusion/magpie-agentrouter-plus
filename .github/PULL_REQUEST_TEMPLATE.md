<!-- 本仓库：ForsakenDelusion/magpie-agentrouter-plus；PR 目标分支 main。 -->
<!-- 标题使用 type(scope): 简短说明，例如 fix(request): 保留纯文本历史 phase。 -->
<!-- 将编号替换为真实的本仓库 Issue；需要合并后关闭时改用 Fixes #123。 -->
Refs #123

## 改动说明

<!-- 说明为什么改、具体改了什么和刻意不改什么；区分上游继承与本 fork 新增。 -->
<!-- 采用上游／第三方改动时记录 commit、来源和许可，不覆盖固定文档快照。 -->

## 验证证据

<!-- 填写实际 OS、Node.js／Python、命令、结果与脱敏反例；未运行项目写原因，不虚报通过。 -->
<!-- npm test；npm run test:policy；npm run test:headers；npm pack --dry-run -->
<!-- 路由变化覆盖默认／切换、缓存 loader、在途请求、覆盖优先级和 Request/凭据边界。 -->
<!-- 历史变化覆盖 role/phase、精确文本、原生 ID-only 引用、工具与不透明状态，不只改旧测试预期。 -->
<!-- 离线通过不代表两端恢复或性能改善；真实推理可能消耗额度／费用，须注明是否获得授权及是否运行。 -->

## 风险与兼容性

<!-- 说明历史／工具／引用保留、账户站点与凭据作用域、旧覆盖地址、打包和升级／回退影响；无影响也解释原因。 -->
<!-- 不删除不透明 reasoning／拒绝／注释／工具／引用制造成功，不新增失败请求自动重试或重放。 -->
<!-- 不静默删除旧 endpoint/apiBase，不假设卸载旧插件保留认证，不同时加载两个 agentrouter provider。 -->

- [ ] 我确认未提交真实凭据、Cookie、Token 或用户对话。

<!-- 贡献指南：https://github.com/ForsakenDelusion/magpie-agentrouter-plus/blob/main/CONTRIBUTING.md -->
<!-- CI gate、PR policy 与 CodeQL 不能替代人工审查；机器人不会自动批准或合并。 -->
