# Report 页面（Customer / Domain）— 打通 Group-only 模式 + 收尾遗留旧接口

> **范围**：`src/pages/report/shared/reportScope.js`、`src/pages/report/domain/domainReportApi.js`、
> `src/utils/company/companySessionSwitchCore.js`、`src/utils/company/sharedCompanyFilter.js`
> （`fetchOwnerGroupsAll`）。**后端改动**：`DomainReportDTO` / `ReportDao` / `ReportMapper.xml`
> (`findDomainReportRows`) / `ReportServiceImpl` 加了一个可选的 `category` 参数（默认 `GAME`，不影响
> 现有行为）。**最后更新**：2026-08-25

---

## 0. 起因

`/customer-report` 在纯 Group 模式（选中 Group ID pill、未下钻到具体 Company，如截图里的
`GOK / OK` 选 `OK`）会直接抛 `tenantIdRequired`。根因：Customer/Domain Report 的 scope 解析借用了
Transaction 的 `resolveTransactionScope()`，其 `mode: "group"` 分支刻意把 `scopeCompanyId` 留成 `0`
（Transaction 自己的 group ledger 走的是另一套聚合逻辑，不需要单一 tenantId）。但 Report 的 Spring
接口（`fetchCustomerReport` / `fetchAccounts` / `fetchReportScopeCurrencies`）都是单租户调用，拿到
`scopeCompanyId <= 0` 要么直接抛错、要么静默返回 `[]`。

Data Capture 早就解决过同一个问题（group payroll：SALARY/COMMISSION/BONUS/PROFIT）：把 group 自己的
entity company（`company_id` 等于 group 代码那一行，比如真的叫 "OK" 的那家）的 `id` 当成普通
tenantId 去打 Spring 接口。这个 entity company **就是**一个真实 tenant，`DataCaptureSummaryServiceImpl`
里 `ensureBankProcess` 已经证实：group payroll 提交会在这个 tenant 下建 `category=BANK` 的
`process` 行，并写入普通的 `transactions`（WIN/LOSE），跟 GAME 类别走的是完全一样的表。

顺带在联调过程中又炸出两个同类型的「旧接口没跟着代理规则迁移」的 bug（详见 §2、§3）。

---

## 1. Group-only tenantId 解析

`resolveCustomerReportScope()`（`reportScope.js`）在映射出 `mode: "group"` 之后，若
`scopeCompanyId` 还没被解析出正数，就用文件里已有的 `resolveGroupEntityRowFromSnap(list, groupId)`
（内部走 `companiesGroupEntityList`）找到这个 group 的 entity company 行，把它的 `id` 塞进
`scopeCompanyId`，并清掉 `resolveCompanyViaGroupId`。**只在 `mode === "group"` 分支里生效**，
Company / Aggregate 分支完全没动，Group 和 Company 的 scope 解析互不掺杂。

因为 `customerReportApi.js`（`fetchCustomerReport`/`fetchAccounts`）、`reportCompanyApi.js`
（`fetchReportScopeCurrencies`）、`domainReportScope.js`（`resolveDomainReportScope` 直接委托给
同一个函数）全部消费这里算出来的 `scopeCompanyId`，这一处改完，Customer Report 和 Domain Report
的 Group-only 模式**同时**拿到了可用的 tenantId——Account 下拉自然显示的就是 group 自己的账户列表，
不是 OK1+OK2 合并出来的。

---

## 2. Domain Report 的 Group Process 下拉：legacy PHP → Spring

`Count/docs/frontend-springboot-migration.md` §6.1 之前把这个 Group-only 分支明确记成「有意保留
PHP，不是遗漏」——当时的理由是 Spring `findDomainReportRows` 的 SQL 写死了
`AND p.category = 'GAME'`，没法查 BANK 类别的 SALARY/COMMISSION/BONUS/PROFIT。**这次确认这个理由
已经不成立**：group payroll 提交本来就落在 Spring 管的 `process`/`data_captures`/`transactions`
表里（见 §0），唯一的缺口只是这行写死的 SQL 条件。于是把 Group-only 也接回了 Spring：

| 能力 | 之前 | 现在 |
|------|------|------|
| Domain Report 列表（Company/Aggregate） | `POST /api/report/domain-report/list` | 不变，新增可选 `category`（默认 `"GAME"`） |
| Domain Report 列表（Group-only） | `GET api/reports/domain_report_api.php`（`fetchDomainReportLegacy`） | `POST /api/report/domain-report/list`，`category: "BANK"` |
| Process 下拉（Company/Aggregate） | `fetchProcessListByTenantId()` → `POST /api/process/process-list` | 不变 |
| Process 下拉（Group-only） | `GET api/reports/domain_report_api.php?action=processes`（`fetchProcessesLegacy`） | 新增 `fetchBankProcessesByTenantId()`，同样打 `POST /api/process/process-list`，但读原始 DTO（`dto.process.category === "BANK"`），不走会把 BANK 行过滤掉的 `normalizeProcessListRows` |

后端改动（全部向后兼容，`category` 缺省即 `"GAME"`，Company/Aggregate 行为字节级不变）：

- `DomainReportDTO`：新增 `private String category;`。
- `ReportDao.findDomainReportRows` / `ReportMapper.xml`：新增 `@Param("category")`，SQL 里
  `AND p.category = 'GAME'` 改成 `AND p.category = #{category}`。
- `ReportServiceImpl.findDomainReportRows`：`category` 为空时落回 `"GAME"`，再传给 DAO。

`domainReportApi.js` 里 `fetchDomainReportLegacy` / `fetchProcessesLegacy` / `appendScopeParams` /
`customerReportScopeApiParams` 的 import 全部删掉——Group-only 不再有任何 legacy PHP 分支。
`domainReportGroupProcesses.js`（`mapDomainGroupProcesses`）、`DomainReportPage.jsx` 都不用改，
它们本来就是按通用的 `{id, process, display_text}` 形状消费。

**已知行为差异**：旧版 PHP 在 Process 下拉加载时会主动 `ensureProcessIdByCode` 把 4 个 payroll
process 都建出来；Spring 只在 Data Capture 真正提交那个 code 时才建（`ensureBankProcess`）。所以
迁移后，一个从没提交过比如 BONUS 的 group，Domain Report 下拉里暂时不会出现 BONUS 选项，直到真的
提交过一次。这是"还没数据可报"，不需要代码修，但跟旧版体验不同，值得留意。

---

## 3. 联调时顺手挖出的两个旧接口 bug

跟本次 Report 改动本身无关，但都是切 Report 页面时才会触发、同一类「代理把所有未映射的 `/api/*`
都转给 Spring，legacy PHP 端点直接 404/500」的问题：

### 3.1 `companySessionSwitchCore.js` 还打死掉的 session 切换接口

Customer/Domain Report 从 Group 切到 Company pill 时报 "Switch failed"。根因：
`syncCompanySessionInBackground()` → `fetchUpdateCompanySession()` 还在调
`api/session/update_company_session_api.php`，这个路径没进 `apiUrl.js` 的迁移映射表。
`companySessionSync.js`（`syncCompanySessionApi`）早就迁移到 `POST /auth/switch-tenant?tenant_id=`
了，`companySessionSwitchCore.js` 是漏掉的另一份重复实现。

修法：让 `fetchUpdateCompanySession` 也打 `POST /auth/switch-tenant`，保留 `signal` 支持（Report
页面快速切换公司时用得到的 abort 能力，`syncCompanySessionApi` 没有这个参数，所以没有直接复用它），
并补上 `rememberCompanySessionFlags(json.data)` 跟 `syncCompanySessionApi` 保持一致。受影响的三个
调用方（`CustomerReportPage.jsx`、`DomainReportPage.jsx`、`transaction/hooks/useTransactionData.js`）
不用改。

### 3.2 `fetchOwnerGroupsAll()` 还打死掉的 `get_groups` 接口

Report 页面 boot 阶段（owner 角色）会调 `fetchOwnerGroupsAll()` 去填 `group_code → expiration_date`
的缓存，实际打的是 `api/domain/domain_api.php`（`action:get_groups`），同样没进迁移映射表，请求必挂。
调用方用 `.catch(() => null)` 吞掉了，不会导致页面报错，`resolveGroupExpirationDate()` 也有兜底
（读 `getCachedOwnerCompanies()` 里的 group entity company 行），所以不是硬故障，但每次 Report/
Transaction/Dashboard 页面加载都会白打一次必挂的请求。

Spring 那边**没有**这张 `groups` 表的对应实现——`DomainController` 只有 `/api/domain/list`
（owner 的 tenant 列表，不是 group 级别的记录），后端完全没有 Group entity/DAO。补一个新端点属于
新范围的工作，这次先直接把 `fetchOwnerGroupsAll()` 改成 no-op（只设空缓存、不再发请求），四个调用方
（Customer Report、Domain Report、Transaction、Dashboard）都不用改，行为跟请求必挂时完全一致，只是
不再有一次注定失败的网络请求。

---

## 4. 验证清单

1. 起 Spring Boot（8082）+ 前端（5173）。
2. 用有 Group（比如 "OK"，子公司 OK1/OK2）的 owner 登录，进 `/customer-report`，选 Group ID "OK"、
   不选 Company（截图里的状态）：
   - 不再报 `tenantIdRequired`。
   - Account 下拉是 OK 这个 group 自己的账户，不是 OK1+OK2 合并出来的。
   - 报表正常加载出 win/lose。
   - Network 面板：`/api/report/customer-report/list`、`/api/account/list`、`/api/currency/list`，
     没有任何 `.php`。
3. 进 `/domain-report`，同样纯 Group "OK" 状态：
   - Process 下拉出现 PROFIT/SALARY/COMMISSION/BONUS 里已经提交过数据的那几个，来自
     `/api/process/process-list`（Network 面板确认没有 `domain_report_api.php`）。
   - 选一个 process 加载报表，命中 `/api/report/domain-report/list`，数字对得上。
4. 在两个页面上把 Group 切到子公司 pill（OK1）：
   - 不再报 "Switch failed"。
   - Company 模式下 GAME process / account / currency 列表跟迁移前一致（回归检查）。
5. 独立（非 group）公司也跑一遍两个页面，确认没受影响（§1 的改动只在 `mode === "group"` 分支生效）。
6. Network 面板全程盯着，确认没有任何请求打到 `.php` 结尾的路径。

---

## 5. 已知未变更 / 需要后续跟进的边界

- `Count/docs/frontend-springboot-migration.md` §6.1 记录的"Domain Report Group-only 有意保留
  PHP"这条判断，本次已经不成立，读那份文档时要按这份为准（该文档在后端仓库，本次没有一并改，
  提醒后续维护者留意）。
- `fetchOwnerGroupsAll()` 的 Spring `groups` 表端点仍未补上（§3.2）——目前 no-op + 兜底路径够用，
  之后如果要恢复 Domain 设置里 group 级别的 expiration_date 展示，需要新建 Group entity/DAO/
  Controller，是独立一块工作。
- `pages/autorenew/autoRenewTenantSettings.js` 仍在用 `get_companies`/`get_groups`/
  `get_domain_fee_settings` 这几个 PHP action（跟 `domain-springboot-rewire.md` §5 记录的一样），
  不在本次 Report 页面范围内。
