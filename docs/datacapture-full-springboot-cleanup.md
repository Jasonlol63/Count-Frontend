# Data Capture / Data Capture Summary — 清除剩餘 PHP 殘留，全面切 Spring Boot

> **范围**：`src/pages/datacapture/` + `src/pages/datacapturesummary/` 两个目录下，所有仍在调用旧 PHP
> 端点（`*.php`）的前端代码。本次**没有改动任何后端代码**——全部改动是把前端接线到**已经存在**的
> Spring Boot 端点上（部分来自 Account 页，部分来自 Maintenance > Formula 页），因此本文档只详细
> 描述前端改动。
> **最后更新**：2026-08-19（Edit Formula Save 报「Process Id is required」但改动实际未落库的 bug，见 §5）
> **后端契约参考**（未改，仅引用）：`Count/docs/frontend-springboot-migration.md` 第32节（Games/Formula CRUD/Submit
> 契约）、`Count/backend/.../MaintenanceController.java`（`formula-maintenance/list` 契约，本次复用）

---

## 0. 起因

用户在 Summary 页测试 SALARY（Bank）流程时，Submit 弹出通用错误「An unexpected error occurred.」。
追查发现这不是 Submit 本身的问题——**Summary 页面一打开就已经在请求失败**：`useSummaryTableModel.js`
的 populate 流程会调用 `fetchSummaryAccountList()` / `fetchSummaryTemplates()`，这两个函数当时还在打
纯 PHP 端点 `api/datacapture_summary/summary_catalog_api.php` / `summary_templates_api.php`——这两个
端点在当前后端（Spring）里根本不存在对应实现，`apiUrl.js` 的重写表里也没有这两个路径的条目，所以每次
请求都以 500 收场，浏览器 console 能看到连续多次 `Failed to load resource: 500` + `Pure summary
populate failed: Error: An unexpected error occurred.`。

顺着这个线索把 `datacapture` + `datacapturesummary` 两个目录**整个扫了一遍**（含所有 import 进来的
hook/lib），确认哪些还在走 PHP、哪些是文件里明确写过「暂不迁移」的范围、哪些是单纯没人调用的死代码。
本文档记录扫描结果 + 全部修复。

---

## 1. 修复总览

| 能力 | 旧 PHP 端点 | 新 Spring 端点 | 改动文件 |
|------|-------------|-----------------|----------|
| Summary 表格 populate — 帐户下拉 | `GET api/datacapture_summary/summary_catalog_api.php` | `POST /api/account/list?tenant_id=`（复用 `accountListApi.js`） | `lib/summaryApi.js` |
| Summary 表格 populate — 回填已存公式 | `POST api/datacapture_summary/summary_templates_api.php?action=templates` | `POST /api/maintenance/formula-maintenance/list`（**复用 Maintenance > Formula 页的后端端点**，见 §2.2） | `lib/summaryApi.js` |
| Summary 草稿状态（跨刷新恢复） | `GET api/datacapture_summary/summary_state_api.php?action=get_summary_state` | **无需 API** — `data_capture_summary_state` 表在 tenant 模型下故意没建，草稿早就改用前端 session/localStorage（`summaryRefreshStatePure.js`） | `lib/summaryApi.js` |
| Edit Formula 弹窗帐户/币别下拉的 PHP 兜底 | `GET summary_catalog_api.php`（Spring 为空时的 fallback） | 移除 fallback，纯 Spring（`fetchAccountListByTenantId` + `fetchCaptureCurrenciesByTenantId`） | `hooks/useSummaryEditFormulaPure.js` |
| Summary「+ Add Account」— 建帐户（company scope） | `POST api/accounts/addaccountapi.php` + N 次 `account_company_api.php?action=add_company` + M 次 `account_currency_api.php?action=add_currency` | `POST /api/account/add`（**一次请求**，`tenantIds[]` / `currencyIds[]` 一并写入） | `hooks/useSummaryAddAccount.js` |
| 同上 — 角色下拉 | `GET api/editdata/editdata_api.php` | **无需 API** — 复用 Account List 页本来就用的静态 fallback 列表 `getAccountModalOrderedRoles([])` | `hooks/useSummaryAddAccount.js` |
| 同上 — 可选币别 | `GET api/accounts/account_currency_api.php?action=get_available_currencies` | `POST /api/currency/available?tenant_id=` | `hooks/useSummaryAddAccount.js` |
| 同上 — 可选公司 | `GET api/accounts/account_company_api.php?action=get_available_companies` | **无需 API** — 新建帐户本来就没有已连接公司，回退结果恒等于「当前公司」，`resetToAdd()` 已经直接给了这个默认值 | `hooks/useSummaryAddAccount.js` |
| 同上 — 建/删幣別 | `create_currency_api.php` / `delete_currency_api.php` | `POST /api/currency/add` / `POST /api/currency/delete` | `hooks/useSummaryAddAccount.js` |
| Data Capture 页公司切换 session 同步 | `GET api/session/update_company_session_api.php?company_id=` | `syncCompanySessionApi()` → `POST auth/switch-tenant?tenant_id=` | `lib/dataCaptureCompanyAccess.js` |
| Data Capture 页访问权限判断（Games/Bank 分类 fallback） | `POST api/domain/domain_api.php`（`get_company_permissions`） | `fetchTenantCategoryPermissions()`（读 `switch-tenant` 返回的 `has_game`/`has_bank`） | `lib/dataCaptureCompanyAccess.js` |
| 浏览器返回/还原（`restore=1`）时补回币别 | `GET api/processes/processlist_api.php?action=get_process` | `postGameCaptureForm({ tenantId, captureDate, processPk })`（主流程本来就在用的 Games 表单 Spring 端点） | `hooks/useDataCaptureSubmitReset.js` |

---

## 2. 各文件详细改动

### 2.1 `src/pages/datacapturesummary/lib/summaryApi.js`

**`fetchSummaryAccountList(captureScope)`**

之前：内部调 `fetchSummaryFormCatalog()`，纯 PHP GET。
现在：

```js
export async function fetchSummaryAccountList(captureScope) {
  const tenantId = resolveDataCaptureTenantId(captureScope);
  if (!tenantId) return [];
  const rows = await fetchAccountListByTenantId(tenantId);
  return filterAccountListRows(rows);
}
```

`fetchAccountListByTenantId` / `filterAccountListRows` 来自 `pages/account/accountListApi.js`——跟
Account List 页、Edit Formula 弹窗用的是同一套函数，没有另外写一份。

**`fetchSummaryTemplates({ captureScope, companyId, processId, processCode })`**

这是这次修复里最关键的一步。Summary 页需要「把某个 tenant + process 下所有已存的
`data_capture_formula` 行（MAIN + SUB）取回来，回填到表格」——查了后端发现 **这个能力已经存在**，就是
`MaintenanceController.formula-maintenance/list`（`POST /api/maintenance/formula-maintenance/list`，
body `{ tenantId, process, category }`），Maintenance > Formula 页面本身其实**还没接上**（该页面的
`formulaMaintenanceLogic.js` 目前仍打 PHP `formula_maintenance/list_api.php`，是另一个未迁移的缺口，
不在本次范围内），但后端契约完整可用，直接复用：

```js
export async function fetchSummaryTemplates({ captureScope, companyId, processId, processCode = "" }) {
  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);
  const code = String(processCode || "").trim().toUpperCase();
  const numericId = processId != null && Number(processId) > 0 ? Number(processId) : null;
  const process = numericId != null ? String(numericId) : code;   // 端点接受 code 或数字 id 字符串
  if (!tenantId || !process) return { templates: {}, subsByParent: null, diagnostics: null };

  const res = await fetch(buildApiUrl("api/maintenance/formula-maintenance/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, process, category: resolveFormulaMaintenanceCategory(code) }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || `HTTP ${res.status}`);
  return buildTemplatesFromFormulaRows(json.data);
}
```

`category` 走跟 Submit 一样的判定：`processCode` 落在 `GROUP_PAYROLL_PROCESS_CODES`
（`PROFIT/SALARY/COMMISSION/BONUS`，复用 `dataCaptureGroupOnlyProcesses.js` 的
`isGroupPayrollProcessId()`，不重复定义一份新的 Set）→ `"bank"`，否则 `"games"`。

后端这个端点回的是**扁平列表**（`MaintenanceFormulaDTO[]`，camelCase，`account`/`currency` 已经是
join 好的显示字符串），但 `summaryTemplatePopulatePure.js` / `summaryTemplateMatching.js` /
`summaryRowData.js` 这几个负责把数据套进表格行的纯函数，读的字段名是旧 PHP 时代遗留的 **snake_case**
（`id_product` / `account_id` / `account_display` / `formula_operators` / `enable_source_percent` 等，
其中有几个字段这几个文件本来就同时兼容 camelCase，但 `enable_source_percent` / `source_percent` /
`formula_operators` 等几个只认 snake_case）。为了不去动这几个已经很复杂、牵一发动全身的纯函数，改在
API 边界做一次 normalize——新增两个私有辅助函数：

```js
/** Spring MaintenanceFormulaDTO 行 -> summaryRowData.js / summaryTemplateMatching.js 认的旧字段形状 */
function toTemplateShape(row) {
  return {
    id: row.id,
    id_product: row.idProduct,
    parent_id_product: row.parentIdProduct,
    formula_variant: row.formulaVariant,
    sub_order: row.subOrder,
    account_id: row.accountId,
    account_display: row.account,        // 后端已 join 好的账户显示码
    currency_display: row.currency,      // 后端已 join 好、大写的币别代码
    currency_code: row.currency,
    description: row.description,
    source_columns: row.sourceColumns,
    formula: row.formula,
    formula_operators: row.formulaOperators,
    input_method: row.inputMethod,
    source_percent: row.sourcePercent,
    enable_source_percent: row.enableSourcePercent,
  };
}

/** 扁平行 -> { templates: {idProduct: MAIN行}, subsByParent: {idProduct: [SUB行,...]} } */
function buildTemplatesFromFormulaRows(rows) {
  const templates = {};
  const subsByParent = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const idProduct = String(row?.idProduct || "").trim();
    if (!idProduct) continue;
    const shaped = toTemplateShape(row);
    if (String(row.productType || "").toUpperCase() === "SUB") {
      const parentId = String(row.parentIdProduct || idProduct).trim();
      (subsByParent[parentId] ??= []).push(shaped);
    } else {
      templates[idProduct] = shaped;
    }
  }
  return { templates, subsByParent, diagnostics: null };
}
```

按后端 Add Formula 的落库规则（`data_capture_formula` 的 `(tenant_id, process_id, product_type,
id_product, ...)` 唯一键 + 「已有带 account_id 的 MAIN 才会插 SUB」的写入顺序），**同一个 idProduct
不会有一笔以上带 account_id 的 MAIN**，所以这里不用处理旧 PHP 遗留的「一个 idProduct 多个 MAIN 变体
（`allMains[]`）」的分支——每个 idProduct 直接对应唯一一个 MAIN 对象，`summaryTemplatePopulatePure.js`
里读 `template.main || template` 的 fallback 分支天然会命中。

**`fetchSummaryServerState(...)`**

```js
/**
 * `data_capture_summary_state` was deliberately never built (see backend
 * docs/frontend-springboot-migration.md 第32节) — unsubmitted draft state lives in front-end session/localStorage instead
 * (`summaryRefreshStatePure.js` / `summaryStorage.js`). No Spring or PHP endpoint backs this.
 */
export async function fetchSummaryServerState() {
  return null;
}
```

原函数会静默吞掉失败（`json.success !== true` 时直接 `return null`，不抛错），所以严格来说它没有直接
造成 Submit 报错，但每次 populate 都会打一个注定 500 的请求，纯属噪音——既然对应的表在新 schema 里本来
就没建、这功能改用前端 storage 落实，直接不发请求。

**清掉的死代码**：`fetchSummaryFormCatalog()`（GET `summary_catalog_api.php` 默认加载）、
`deleteSummaryTemplate()`（POST `summary_templates_api.php?action=delete_template`）——两个函数在整个
仓库里已经没有任何 import（Formula 删除早就切到 `summarySaveTemplatePure.js` 的
`deleteFormulasSpring()`），连带清掉只服务它们的 `SUMMARY_CATALOG_API` / `SUMMARY_TEMPLATES_API` /
`SUMMARY_STATE_API` 常量、`withCompany()` / `parseJsonResponse()` 辅助函数。

**保留不动（写作时）**：`submitSummaryPayload()`（`SUMMARY_SUBMIT_API` = `summary_submit_api.php`）——当时是真
AP/IG group ledger 的批次提交，后端 tenant/process 解析仍依赖未迁移的 `get_group_process_id`
（`Count/docs/frontend-springboot-migration.md` 第32节曾列为暂不迁移），本次不碰。`submitSummaryToSpring()`
（Games/Bank company scope 的单次 Spring 提交）不变。**2026-08-25 更新**：`submitSummaryPayload()` 这条
PHP 分批提交路径实际上早已被替换掉，`executeSummarySubmit()` 现在所有 Group scope 都走 Spring，见
`Count/docs/frontend-springboot-migration.md` 第7节。

---

### 2.2 `src/pages/datacapturesummary/hooks/useSummaryEditFormulaPure.js`

`fetchEditFormulaCatalog()` 原本是「先打 Spring，Spring 账户为空或抛错就整个 fallback 回 PHP
`fetchSummaryFormCatalog()`」。因为 §2.1 已经把 `fetchSummaryFormCatalog` 整个删掉，这里的 PHP
fallback 分支必须一起清掉，改成纯 Spring：

```js
/** POST /api/account/list?tenant_id= (active only) + POST /api/currency/list?tenant_id= — Add/Edit Formula dropdown data. */
async function fetchEditFormulaCatalog(captureScope, companyId) {
  const tenantId = resolveDataCaptureEffectiveTenantId(captureScope, companyId);
  if (!tenantId) return { accounts: [], currencies: [] };
  const [accountsRaw, currencies] = await Promise.all([
    fetchAccountListByTenantId(tenantId),
    fetchCaptureCurrenciesByTenantId(tenantId),
  ]);
  return { accounts: filterAccountListRows(accountsRaw), currencies };
}
```

不再有「Spring 返回空账户列表就当作失败去打 PHP」的误判——租户底下真的没有 active 账户是合法状态，不该
触发 fallback。

---

### 2.3 `src/pages/datacapturesummary/hooks/useSummaryAddAccount.js`

Summary 页「+ Add Account」弹窗，这次改动量最大。这个 hook 原本不分场景，company scope 和真
group-ledger scope 共用同一套 PHP 调用；现在按 `ledgerCtx.groupOnlyAccountMode` 分两条路：

- **company scope**（Games/Bank/C168 等主要场景，绝大多数使用者会走这条）→ 全部改 Spring，复用
  `pages/account/accountListApi.js`（跟 Account List 页同一套函数，没有另外写）。
- **真 group ledger scope**（`groupOnlyAccountMode === true`）→ **原样保留 PHP**，不属于本次范围
  （见 §3「有意保留」）。这个场景下页面拿到的只是 group code（如 `"AP"`），没有可直接用的数字
  `tenant.id` 去打 Spring 的 tenant-scoped 端点；要接 Spring 需要先解出「组的实体公司行」的数字 id
  （参考 `docs/maintenance-bankprocess-payment-springboot.md` §2 的 `resolveGroupEntityRowFromSnap`
  做法），这属于另一块工作量，本次没做。

**角色下拉（`loadRoles`）—— 整个函数删除**

旧代码打开弹窗时会先 `await loadRoles()`，命中 `GET api/editdata/editdata_api.php` 拿角色列表。查证
后发现 Account List 页（早就 100% Spring 的那个页面）**从来没有调用过任何角色 API**——它的
`roles` state 初始化成 `[]` 之后再也没被 `setRoles()` 赋值过，全靠
`accountLogic.js` 的 `getAccountModalOrderedRoles([])`：

```js
export function getAccountModalOrderedRoles(roles) {
  const merged = [...(roles || [])];
  if (merged.length === 0) {
    // Empty group / roles API miss — still offer full account role list for the modal.
    ROLE_PRIORITY.forEach((role) => merged.push(role));
  }
  ...
}
```

——传空数组进去，自动 fallback 成完整的 `ROLE_PRIORITY` 静态列表。这次直接复用同一个既有约定：
`useSummaryAddAccount.js` 的 `roles` state 保持 `[]`（不再 `setRoles`），`orderedRoles` 照样算得出
完整角色列表，`loadRoles()` / `editdata_api.php` 整个不需要了。

**可选币别（`loadSelectionMeta` 里的 currency 部分）**

```js
const rows = await fetchAvailableCurrencies(ctx.companyId, null);   // accountId=null：全新帐户，还没连过任何币别
setCurrencies(rows.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
setSelectedCurrencyIds(pickDefaultAddCurrencyIds(rows));
```

`fetchAvailableCurrencies(tenantId, accountId)` 就是 Edit Formula 弹窗、Account 页在用的那个
`POST /api/currency/available` 封装，`accountId` 传 `null` 时后端回全部币别、`is_linked` 恒为
`false`（新帐户还没连过任何东西），跟旧 PHP `get_available_currencies` 在「新建」场景下的语义一致。

**可选公司 —— 整段调用删除**

旧代码额外打一次 `account_company_api.php?action=get_available_companies` 去决定
`selectedCompanyIds` 默认值；但「新建帐户」在这次调用时 `account_id` 恒为 `null`，后端不可能返回任何
`is_linked: true` 的公司，所以这段代码实际算出来的默认值永远是 `[当前公司]`——而 `resetToAdd()`
本来就已经直接把 `selectedCompanyIds` 设成 `[Number(ctx.companyId)]` 了。这段请求对新建场景是
纯粹的空转，直接删掉。

**建/删币别（`createCurrency` / `removeCurrency`）**

```js
const created = await createTenantCurrency({ code, tenantId: ctx.companyId });   // POST /api/currency/add
...
const result = await deleteTenantCurrency({ id: cid, tenantId: ctx.companyId }); // POST /api/currency/delete
```

**建帐户（`submitAddAccount`）**

旧流程是「`addaccountapi.php` 建帐户 → 拿到 `newAccountId` → 并发 N 次 `account_company_api.php?
action=add_company` 挂公司 → 并发 M 次 `account_currency_api.php?action=add_currency` 挂币别」，
三个独立请求阶段。新流程是**一次请求**：

```js
const request = buildAccountCreateRequest(form, ctx.companyId, currencyIds, tenantIds);
const created = await createAccountUser(request);   // POST /api/account/add
```

`buildAccountCreateRequest` / `createAccountUser` 同样是 `accountListApi.js` 里 Account List 页在用
的函数——`UserListDTO` 请求体里 `currencyIds[]` / `tenantIds[]` 直接一起写入，后端一个事务搞定，不用
分阶段补救。

---

### 2.4 `src/pages/datacapture/lib/dataCaptureCompanyAccess.js`

**`syncDataCaptureCompanySession(companyId)`**

```js
// 之前：直接 fetch PHP api/session/update_company_session_api.php?company_id=
// 现在：
export async function syncDataCaptureCompanySession(companyId) {
  return syncCompanySessionApi(companyId);
}
```

`syncCompanySessionApi()`（`utils/company/companySessionSync.js`）就是全站切公司都在用的
`POST auth/switch-tenant?tenant_id=` 封装，本来就在被 `DataCapturePage.jsx` 另外三处直接调用——这个
文件里单独重复实现了一份 PHP 版本，读的却是同一个返回形状（`{ success, data: { has_gambling,
has_bank, ... } }`），改成直接委托没有任何行为差异。

**`resolveCompanyGamesAccess()` 的权限 fallback 链**

原本失败时会依序打两个不同来源的 PHP（`fetchCompanyHasGamesCategory()` 内部包一层
`fetchCompanyPermissionsForDataCapture()`，然后如果还是不行再原样打第二次
`fetchCompanyPermissionsForDataCapture()`）——两次请求打的是**同一个** PHP 端点、同一个
`companyCode`，只是分别检查「有没有 Games」「是不是纯 Bank」。改成一次 Spring 请求同时算出两个结论：

```js
try {
  const result = await fetchTenantCategoryPermissions(numericId);   // 已存在：读 switch-tenant 的 has_game/has_bank
  const perms = result.success && Array.isArray(result.data?.permissions) ? result.data.permissions : [];
  const hasGames = permissionsIncludeGames(perms);
  if (hasGames) return true;
  return perms.includes("Bank");
} catch {
  return false;
}
```

`fetchTenantCategoryPermissions()`（`dataCaptureSpringApi.js`）本来就是给分类 pill（Games/Bank 按钮）
用的既有函数，`{ success, data: { permissions } }` 的返回形状跟旧 PHP 端点一致，可以直接拿来在这个
fallback 里用，不用另外写。

**清掉的死代码**：`fetchCompanyHasGamesCategory()`——因为它的逻辑已经内联进
`resolveCompanyGamesAccess()`，函数本身没有其他调用方了。

---

### 2.5 `src/pages/datacapture/hooks/useDataCaptureSubmitReset.js`

浏览器返回/前进触发的 `restoreFromStorage()` 流程里，有一段「session 里没存币别时，去后端补一下当前
process 的币别」的兜底逻辑，原本打的是 PHP `processlist_api.php?action=get_process`：

```js
// 之前
const res = await fetchProcessDetail(pid, captureScope);
if (res.success && res.data) {
  await callDataCaptureRuntime("syncRestoreForm", {
    ...processData,
    currency: processData.currency || res.data.currency_id,
  });
}

// 现在 —— 复用主流程本来就在用的 Games 表单 Spring 端点
const tenantId = resolveDataCaptureTenantId(captureScope);
const numericPid = Number(pid);
if (tenantId && Number.isFinite(numericPid) && numericPid > 0 && processData.date) {
  try {
    const res = await postGameCaptureForm({
      tenantId,
      captureDate: processData.date,
      processPk: numericPid,
    });
    const selected = res?.data?.selectedProcess;
    if (selected) {
      await callDataCaptureRuntime("syncRestoreForm", {
        ...processData,
        currency: processData.currency || selected.currencyId,
      });
    }
  } catch {
    /* restore currency fallback is best-effort; keep the already-restored session as-is */
  }
}
```

`postGameCaptureForm({ tenantId, captureDate, processPk })` 就是选 process 时主流程本来在用的那个
`POST /api/datacapture/games/form`，带 `processPk` 会额外回 `selectedProcess`（含 `currencyId`）。这条
路径只在「session 里恰好没存币别」时才会触发，属于 best-effort 兜底，失败就直接跳过（保留已经从
localStorage 恢复出来的 session 原样），不阻断整个还原流程。

---

### 2.6 `src/pages/datacapture/lib/dataCaptureApi.js` — 清死代码

扫描确认以下 8 个导出函数在**整个仓库**里已经没有任何 import（旧版整批覆盖遗留、迁移后从未清理），
全部删除：

| 删除的函数 | 原打的 PHP 端点 |
|---|---|
| `fetchAddProcessFormData` | `GET api/datacapture/catalog_api.php` |
| `fetchCurrenciesForCompanyIds`（标注 `@deprecated`） | `GET api/transactions/get_company_currencies_api.php` |
| `fetchProcessesByDay` | `GET api/datacapture/submissions_api.php?action=get_processes_by_day` |
| `fetchProcessDetail` | `GET api/processes/processlist_api.php?action=get_process` |
| `fetchSubmissionsByCaptureDate` | `GET api/datacapture/submissions_api.php?action=get_submissions_by_capture_date` |
| `fetchCompanyPermissionsForDataCapture` | `POST api/domain/domain_api.php`（`get_company_permissions`） |
| `fetchDescriptionCatalog` | `GET api/datacapture/catalog_api.php` |
| `postAddDescription` | `POST api/datacapture/catalog_api.php`（`action=add_description`） |
| `postDeleteDescription` | `POST api/datacapture/catalog_api.php`（`action=delete_description`） |

连带清掉只服务这批死函数的 `DATA_CAPTURE_CATALOG_API` 常量、`withScope()` / `withCompany()` 私有
辅助函数。

**保留不动**（§3 的两个「有意保留」exception 本来就住在这个文件里）：`fetchGroupCaptureCurrencies`、
`fetchGroupProcessIdByCode`，以及它们共用的 `DATA_CAPTURE_SUBMISSIONS_API` 常量、
`appendDataCaptureScopeParams()`（后者还被 `summaryApi.js` 的 `submitSummaryPayload` 引用，不能删）。

---

## 3. 仍然有意保留 PHP 的范围（写作时未动；**2026-08-25 更新：本节已全部清理完毕**，见下方表格后的更新说明）

以下全部限定在**真 AP/IG group ledger scope**（`isGroupLedgerCapture()` 判定为 true 的分支），
后端 tenant/process 解析当时仍依赖未迁移的 `get_group_process_id`（`Count/docs/frontend-springboot-migration.md`
第32节），本次范围之外，代码里都留了注释标注：

| 函数 / 文件 | PHP 端点 |
|---|---|
| `fetchGroupProcessIdByCode()`（`dataCaptureApi.js`） | `api/datacapture/submissions_api.php?action=get_group_process_id` |
| `fetchGroupCaptureCurrencies()`（`dataCaptureApi.js`） | `api/transactions/get_scope_account_currencies_api.php` |
| `dataCaptureGroupDraftApi.js` 整个文件 | `api/datacapture/group_capture_draft_api.php` |
| `summaryApi.js` 的 `submitSummaryPayload()` | `api/datacapture_summary/summary_submit_api.php` |
| `useSummaryAddAccount.js` 的 `groupOnlyAccountMode` 分支 | `editdata_api.php`（角色，本次已删）之外的 `account_currency_api.php` / `create_currency_api.php` / `delete_currency_api.php` / `addaccountapi.php` |

**2026-08-25 更新**：调查发现新 tenant 模型下 GROUP 类型 tenant 天生自带自己的 `tenant.id`（数据库主键约束保证），
上表第 1-4 行描述的"没有 tenant 身份需要走 PHP"这种情况结构性不存在。实际清点代码后确认表格第 1、3、4 行
（`fetchGroupProcessIdByCode`、`dataCaptureGroupDraftApi.js`、`submitSummaryPayload`）早已不再被调用，
只有第 2 行 `fetchGroupCaptureCurrencies()` 还在用，本次已一并删除（函数本体 + 唯一调用点）。详见
`Count/docs/frontend-springboot-migration.md` 第7节。本节所记录的"仍保留 PHP 的范围"现已不再适用。

---

## 4. 验证方式 / 已知限制

- 6 个改动文件（`summaryApi.js`、`useSummaryEditFormulaPure.js`、`useSummaryAddAccount.js`、
  `dataCaptureCompanyAccess.js`、`useDataCaptureSubmitReset.js`、`dataCaptureApi.js`）都各自过了
  `esbuild --bundle` 全量打包检查（以 `DataCaptureSummaryPage.jsx` / `DataCapturePage.jsx` 为入口，
  两个入口都会把上述文件全部拉进依赖图），没有语法 / import 错误。
- **没有做浏览器实测**——尤其是 Summary 页「+ Add Account」company scope 全流程（建帐户 → 挂公司 →
  挂币别 → 关弹窗 → 表格刷新）、Data Capture 页切公司的访问权限判断，这两处改动面较大，建议人工过一遍。
- Maintenance > Formula 页面本身（`formulaMaintenanceLogic.js`）仍在打 PHP
  `formula_maintenance/list_api.php` 等端点，是另一个尚未迁移的缺口，不在本次范围——本次只是**读用**
  了它对应的 Spring 端点（`formula-maintenance/list`），没有改 Maintenance 页面本身。

---

## 5. 2026-08-19（续）：Edit Formula Save 报错但改动其实没落库

**症状**：Games category 下 Summary 页打开某行 Edit Formula，改完点 Save，右上角弹出
`Error: Process Id is required`，但表格里那一行看起来已经改成新值了——刷新页面后才会打回原样（因为
其实没写进 DB）。

**根因**：`saveUpdateFormulaSpring()`（`formula/summarySaveTemplatePure.js`）组请求体时，只有在
`row.templateId == null`（Bank 场景常见，靠 business key 定位）才会带 `processId`/`processCode`；
`row.templateId != null`（Games 场景，正常都带着 `id`）时完全不带这两个字段。但后端
`DataCaptureSummaryServiceImpl.updateFormula()` **不管请求里有没有 `id`，第一步永远先**
`resolveProcess(tenantId, request.getProcessId(), request.getProcessCode(), ...)`——`id` 定位那步
（`resolveExistingForUpdate`）要等 process 解析完才轮到。缺了 `processId`/`processCode`，
`resolveProcess()` 直接在最前面抛 `"Process Id is required"`，请求还没碰到 DB 就失败了。

「看起来改成功了」是因为 `useSummaryEditFormulaPure.js` 的 `handleSave()` 在真正调 API **之前**就先
`replaceRows(nextRows)` 把新值写进本地表格状态（乐观更新），API 失败只弹 toast，不会回滚这次本地更新。

**修法**（`formula/summarySaveTemplatePure.js`）：`processId`/`processCode` 改成不管有没有 `id` 都带，
两个调用方（Edit Formula 弹窗、表格内双击 Source 行内编辑）本来就有把这两个值传进来，只是被
`if (templateId != null)` 分支吞掉了：

```js
// 之前：只有走「无 id」分支才带 processId/processCode
if (row.templateId != null) {
  body.id = row.templateId;
} else {
  body.processId = processId ?? null;
  body.processCode = resolveFormulaProcessCode(processId, processCode);
  ...
}

// 现在：每次请求都带（后端 resolveProcess 不管有没有 id 都要用）
body.processId = processId ?? null;
body.processCode = resolveFormulaProcessCode(processId, processCode);
if (row.templateId != null) {
  body.id = row.templateId;
} else {
  ...
}
```

过了 esbuild 全量打包检查；未在浏览器里实测确认 error toast 消失 + 刷新后公式真的持久化。
