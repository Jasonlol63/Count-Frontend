# Report 页面（Customer / Domain）— Group/Company 状态管理连环 bug 排查记录 + Spring Boot API 格式建议

> **范围**：本次排查发生在旧版 PHP 前端仓库（`count168test`）的
> `src/pages/report/domain/{DomainReportPage.jsx,domainReportScope.js}`、
> `src/pages/report/customer/CustomerReportPage.jsx`、`src/pages/report/shared/reportGcBoot.js`。
> **本仓库（Count-frontend）现状**：经比对，`pages/report/domain/domainReportScope.js` 和
> `pages/report/domain/DomainReportPage.jsx` 与修复前的旧版**代码一致**，本文档记录的 5 个问题
> **在本仓库尚未修复**（见 §6）。**没有改动任何后端代码**——本文只是把排查过程和结论记下来，
> 并针对 Spring Boot 那边"权限判断应该长什么样"给出建议（见 §7）。**最后更新**：2026-09-08

---

## 0. 起因

用户反馈 Domain Report 页面切 Group（比如从 IG 切到没有权限的 AP）时会报「无权访问该
Group Ledger」，且行为跟 Customer Report 不一致。往下查发现这不是一个孤立 bug，而是**同一个根因
在四个不同触发点上分别炸出来的四个症状**，逐一定位、逐一修复，过程记录如下。

**核心根因**：前端没有任何权威渠道知道"这个 session 到底有没有权限把某个 Group 当成 Group Ledger
打开"，只能靠几条启发式规则去猜（"owner 名下有没有这个 group 的子公司"、"公司列表加载完没有"、
一个写在 `sessionStorage` 里的 sticky 标记），这些猜测**跟后端真正的授权表经常对不上**，于是不断在
"猜错→报错/卡死→用户刷新→凑巧猜对"这个循环里打转。

---

## 1. 症状一：切 Group 到没权限的组，直接报错拦住

**位置**：`domainReportScope.js` 的 `resolveDomainReportScope()`。

```js
const groupOnlyUi =
  Boolean(selectedGroup) &&
  !groupsAllMode &&
  !groupAllMode &&
  (companyId == null || companyId === "" || isDashboardGroupOnlyMode());
```

即使用户**明确点了某个具体 Company 按钮**（`companyId` 有效值），只要 `isDashboardGroupOnlyMode()`
这个 sticky 标记是 true，这里还是会把 `companyId` 强制置空传给
`resolveCustomerReportScope()`，导致 scope 被判定成 `mode: "group"`，命中后端的
`gc_assert_group_ledger_access()` 直接拒绝。

对比 Customer Report：`CustomerReportPage.jsx` 是**直接**调用 `resolveCustomerReportScope()`，
没有这层多余包装；`transactionScope.js` 里"显式点击的 Company pill 永远优先"的规则本来就会正确处理
这个场景。

**修复**：去掉 `groupOnlyUi` 里 `isDashboardGroupOnlyMode()` 那个条件，只保留
`companyId == null || companyId === ""`（纯粹"没有具体公司选择"才算 group-only）。

---

## 2. 症状二：切公司后卡在单 Group 模式，进不去

**位置**：`DomainReportPage.jsx` 的 `onPrepareCompanySelect`（切 Group 时自动选中该 Group 默认
公司的回调）。

修复前只更新了 `companyId`，**没有同步更新 `selectedGroup`**：

```js
const onPrepareCompanySelect = useCallback((c) => {
  const nextId = Number(c?.id);
  ...
  flushSync(() => setCompanyId(nextId));   // selectedGroup 没跟着改
  ...
}, []);
```

Customer Report 的同名回调是把两者放在**同一个 `flushSync`** 里原子更新的。Domain 这边少了这一步，
导致"点 AP → 自动选中 C168"这个动作里，`companyId` 先变成了 C168，但 `selectedGroup` 那一帧还停留在
旧值（比如 IG）——而公司按钮列表是按 `selectedGroup` 派生的，这一帧里 C168 根本不在列表里，于是
`scopeCompanyId` 被判定成无效（null），退回 group 模式，撞上没权限的组，报错卡死。

**修复**：把 `setSelectedGroup` 也塞进同一个 `flushSync`，跟 Customer Report 保持一致。

---

## 3. 症状三：真的没权限时，应该自动退回一个可用公司，而不是死等用户手动刷新

**位置**：`DomainReportPage.jsx` / `CustomerReportPage.jsx` 的 `loadReport()`。

修复 §1、§2 之后，如果账号**真的**没有某个 group 的权限（不是前端猜错，是后端确实拒绝），页面
应该自动退回一个有权限的子公司，而不是把用户晾在报错页面上。

**修复**：在 `loadReport()` 的 `catch` 里识别后端返回的 `"无权访问该 Group Ledger"`
（新增 `isGroupLedgerDeniedError()`），命中后调用 `resolveReportCompanyWhenClosingGroup()`
（复用已有的"关闭 group 时挑一个可用公司"逻辑）自动切换；如果当时 `companies` 列表还没加载完、
挑不出候选，就标记一个 `groupLedgerDenied` 状态位，等 `companies` 异步到位后用一个 `useEffect`
重新尝试——避免"公司列表还没回来"这个纯时序问题被误判成"真的没权限"。

---

## 4. 症状四：刷新页面后，明明选的是具体某个 Company，却先掉回 Group 视图

**位置**：`DomainReportPage.jsx` / `CustomerReportPage.jsx` 里管理硬刷新启动状态的那段 `useEffect`
（内部 IIFE）。

```js
const groupOnlyBoot = ... resolveReportGroupOnlyBoot(u, bootGc, persistedGc, bootGroup);
let nextCompanyId =
  companyId != null ? companyId : groupOnlyBoot ? null : bootGc.companyId;
...
if (nextCompanyId == null && savedCompanyId != null && bootGroup && !groupOnlyBoot) {
  // 只有 !groupOnlyBoot 时才会去恢复上次选的公司
  ...
}
```

`groupOnlyBoot`（本质还是"owner 名下有没有这个 group 的子公司"那条不精确的启发式判断）的优先级
被设计得**高于**"用户刷新前明明保存了一个具体 Company 选择"这件事——哪怕 `savedCompanyId` 是有效的，
只要 `groupOnlyBoot` 算出来是 true，也会被直接覆盖成 null，导致刷新后跳回 Group payroll 视图
（PROFIT/SALARY/COMMISSION/BONUS），而不是用户刷新前正在看的那个具体公司。

**修复**：把优先级倒过来——`nextCompanyId` 直接取 `bootGc.companyId`（它自己内部已经会优先读
`savedCompanyId`），`groupOnlyBoot` 只在**完全没有可恢复的公司**时才生效（用于决定要不要把
sticky 标记重新写回 `sessionStorage`），不再有资格覆盖一个已经解析出来的合法公司选择。

---

## 5. 症状五：Group 按钮"秒亮"，Company 按钮列表却要等接口、刷新一次才出来

**根因**：`selectedGroup` 的初始 state 是直接同步读 `sessionStorage`（`DASHBOARD_GROUP_FILTER_KEY`），
刷新那一刻立刻确定，不依赖任何请求；但 Company 按钮列表依赖的完整公司数据
（`fetchOwnerCompaniesAll`）走的是**页面级内存变量**缓存（`ownerCompaniesCache`），这个变量在每次
硬刷新时必然被清空，必须重新发一次网络请求才能拿回来——所以 Company 那一侧永远比 Group 慢一拍。

**修复（仅限 report 页面，不影响 Dashboard/Maintenance 等其他 29 个共用这份内存缓存的页面）**：
新增一个 report 页面专属的 `sessionStorage` 缓存（`reportGcBoot.js` 的
`readReportCompaniesCache()`/`persistReportCompaniesCache()`），思路是 **stale-while-revalidate**：
硬刷新时先用上次缓存的数据立刻画出按钮和默认选中项，不阻塞首屏；接口回来后照常覆盖 state 并回写缓存，
保证不会真的一直用旧数据。

---

## 6. 本仓库（Count-frontend）现状核对

逐项比对后，以下文件与修复前的旧版**代码一致**，上述 5 个问题在本仓库均**尚未修复**：

- `pages/report/domain/domainReportScope.js`：`groupOnlyUi` 仍带 `isDashboardGroupOnlyMode()`（对应 §1）。
- `pages/report/domain/DomainReportPage.jsx`：
  - `onPrepareCompanySelect` 仍未同步 `setSelectedGroup`（对应 §2）。
  - `loadReport()` 无 group-ledger-denied 的自动恢复逻辑（对应 §3）。
  - boot IIFE 里 `nextCompanyId` 的三元表达式仍是 `groupOnlyBoot ? null : bootGc.companyId`（对应 §4）。
  - `companies`/`resolveReportBootCompanyId` 仍只读内存缓存，无 report 专属 sessionStorage 缓存（对应 §5）。
- `pages/report/customer/CustomerReportPage.jsx`：结构与 `DomainReportPage.jsx` 对称，同样受 §2~§5 影响。

由于本仓库 Report 的**数据读取**路径已经按 `report-group-scope-springboot-migration.md` 切到了 Spring
Boot（`POST /api/report/customer-report/list`、`POST /api/report/domain-report/list` 等），上述 5 个
问题跟"用哪个后端"无关——它们全部是**前端状态管理**层面的 bug，Spring 迁移不会附带修掉它们，需要单独
移植 count168test 那边已经验证过的修复。

---

## 7. Spring Boot API 格式建议（后续优化方向）

这一轮排查暴露的真正问题，不是某一处代码写错了，而是**权限判断这件事的权威来源一直在前端**——前端
只能靠"猜"，猜错了才会在这几个触发点上分别炸出症状。要从根上解决，需要后端在 API 契约层面把这件事
说清楚，而不是让前端继续维护一份自己的近似规则。具体建议：

1. **显式暴露"当前 session 可以把哪些 Group 当 Group Ledger 打开"这份列表**。
   现在前端（`canAccessGroupLedgerForGroup()` / `canUseGroupOnlyMode()`）是用"owner 名下是否有这个
   group 的子公司"去近似"有没有权限"，这两者根本不是一回事。建议在登录/session 接口（或专门的
   `/api/group/accessible-ledgers` 之类端点）里直接返回一份权威的 group code 列表，前端只做查表，
   不再需要启发式猜测。

2. **权限类错误用结构化 code，不要只给一句翻译好的文案**。
   本次 `isGroupLedgerDeniedError()` 只能靠字符串匹配后端返回的中文文案
   `"无权访问该 Group Ledger"` 来判断"是不是权限问题、该不该自动恢复"——这非常脆弱：文案改一个字、
   换一种语言、或者未来这句话被复用在别的场景，识别逻辑就失效。建议 Spring 侧的错误响应统一带一个
   稳定的机器可读字段，比如：
   ```json
   { "success": false, "code": "GROUP_LEDGER_ACCESS_DENIED", "groupCode": "AP", "message": "..." }
   ```
   前端匹配 `code`，`message` 只用来展示，跟判断逻辑彻底解耦。

3. **公司/租户列表接口直接把每个 Group 的可用性带出来**。
   如果 §7.1 的独立端点成本较高，退而求其次的做法是在拉取 owner 公司列表的接口（对应
   `fetchOwnerCompaniesAll`）里，直接给每个 group 打一个 `canUseAsGroupLedger: boolean` 标记，
   前端渲染 Group 按钮、决定要不要走 group-only 分支时直接读这个字段，一次请求拿到权威数据，不用
   自己在多处（`loginScope.js`、`useDashboardStyleGcFilter.js`、boot 逻辑……）各写一套判断。

4. **"上次选择的 Group/Company"可以考虑由后端记住，而不是纯前端 sessionStorage**。
   本次 §4、§5 的一大类 bug 都是"前端自己在 sessionStorage 里维护一份状态优先级，跟异步到达的
   公司列表数据互相打架"导致的时序问题。如果 Spring 那边的用户偏好/session 接口能直接把"上次选择"
   一起返回（比如 boot 接口一次性给出 `{tenantId, groupCode, canUseAsGroupLedger}`），前端就不需要
   自己维护 `DASHBOARD_SELECTED_COMPANY_KEY` / `DASHBOARD_GROUP_ONLY_KEY` 这套多标记互相覆盖的逻辑，
   相当一部分状态竞争问题可以直接消失。这一条改动面较大，建议作为独立评估项，不是这次的必做项。

5. **错误响应格式在整个 Report/Maintenance 家族里保持一致**。
   目前不同接口的失败响应形状略有差异（`{success,message,data}` vs 直接 `throw`
   vs HTTP 状态码语义），如果要落地 §7.2 的结构化 `code` 字段，建议借这个机会统一一版错误响应 DTO，
   一次定好，避免以后每个新接口都要重新猜一遍"这个错误该怎么识别"。

以上 5 条里，**第 1、2 条收益最大、改动相对可控**，建议优先评估；第 4 条属于更大的架构调整，
可以放到后续单独立项。

---

## 8. 后续跟进

- [ ] 把 §1~§5 的修复从 `count168test` 移植到本仓库对应文件（§6 已列出具体文件/位置）。
- [ ] 评估 §7.1/§7.2（accessible-ledgers 端点 + 结构化错误 code）作为 Spring Boot `ReportController`
      / `GroupController`（如果后续新增）的设计输入。
- [ ] 移植修复时，一并跑一遍 `report-group-scope-springboot-migration.md` §4 的验证清单，确认
      Group-only tenantId 解析（该文档已修的部分）跟本文档记录的状态管理修复不冲突。
