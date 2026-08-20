# Summary 页面公式不同步 Bug 修复（2026-08-20）

> 范围：Formula Maintenance 编辑公式后，Data Capture Summary（Transaction Payment 那张汇总表）
> 的 Processed Amount 没有跟着变，仍然按旧公式算。本文档记录排查过程、根因、以及最终改了哪些文件。
> 后端（`Count` 仓库）**没有改动**，问题完全在前端（`Count-frontend`）。
>
> 后续发现即使这次的前端缓存修完，还有第二个独立根因——`formula_operators` 冗余字段导致
> 计算读到的是另一份没同步的旧值，见 [formula-operators-removal.md](./formula-operators-removal.md)。

---

## 1. 现象

1. 在 Formula Maintenance 页面把某一行的 Formula 从 `20.62` 改成 `50.50` 并保存。
2. 后端 `data_capture_formula` 表已经即时更新（确认过：`MaintenanceMapper.xml` 的
   `updateFormulaMaintenanceRow` 是直接 `UPDATE ... WHERE id = #{id}`，没有缓存、没有
   `@Cacheable`、没有定时任务）。
3. 但打开 Data Capture Summary 页面，对应那一行的 Processed Amount 仍然是按 `20.62`
   算出来的，不是 `50.50`。

## 2. 根因：两层前端缓存把新公式吃掉了

Summary 页面的数据流：Data Capture 提交时把整张表写进 `localStorage`（不落库），跳转到
Summary 页后再调 `POST /api/maintenance/formula-maintenance/list` 去把当前公式回填进每一行，
算出 Processed Amount。这条"回填"逻辑本身没错，但有两处缓存机制把它架空了：

### 2.1 sessionStorage 整行快照 —— 根本没有重新请求

[`hooks/useSummaryTableModel.js`](../src/pages/datacapturesummary/hooks/useSummaryTableModel.js)
里，只要不是"刚从 Data Capture 提交跳转过来"（`isFirstFreshPopulate === false`，也就是刷新页面、
后退、直接输网址进来等所有非首次场景），一旦 `sessionStorage` 里存在上一次的整行快照
（`summaryRowsSnapshot:...`），代码会**直接用快照渲染，完全不调用 formula-maintenance 接口**：

```js
// 修复前
if (!isFirstFreshPopulate) {
  const snapshot = loadSummarySessionSnapshotWithFallback(...);
  if (snapshot?.rows?.length) {
    let restoredRows = restoreRateValuesOnRows(snapshot.rows, captureScope);
    restoredRows = mapRowsWithAmountRecalc(restoredRows);
    replaceRows(restoredRows);
    return true;   // populateSummaryRowsPure / fetchSummaryTemplates 根本没被调用
  }
}
```

也就是说，只有"提交后第一次跳进来"这一次会真正拉最新公式；之后每次进 Summary 页都是在
回放这份旧快照——哪怕快照里的公式已经在 Formula Maintenance 被改掉了。

### 2.2 就算真的重新拉取了，新数据也会被旧缓存覆盖回去

就算走到真正会发请求的那条路径（`populateSummaryRowsPure` → `applyMainTemplateToRowModel`
用最新模板给每一行填上最新的 `formulaOperators` / `formulaDisplay` / `account` /
`currency` / `sourceColumns` / `inputMethod` 等字段），之后还有一步
`restoreRefreshStateRows`（`table/summaryTemplatePopulatePure.js`）会把 `localStorage`
里的旧草稿（`summaryRefreshDraft` 之类的 key）合并回每一行，用的是
[`lib/summaryRefreshStatePure.js`](../src/pages/datacapturesummary/lib/summaryRefreshStatePure.js)
里的 `applySavedRefreshRowToModel`：

```js
// 修复前 —— saved（旧缓存）无条件优先，新拉到的 row 值直接被扔掉
formulaOperators: saved.formulaOperators || row.formulaOperators,
account: saved.account || saved.accountDisplay || row.account,
...
```

`saved.formulaOperators` 只要存在（几乎总是存在，因为草稿每次都会存），就会赢，新拉到的
`row.formulaOperators`（本次 fetch 出来的最新公式）根本没机会用上。而 Processed Amount
后面虽然会用 `mapRowsWithAmountRecalc` "重新计算"，但计算的输入 `formulaOperators` 本身
已经是旧值了，所以算出来还是旧结果——表面上看像是"没重新算"，实际上是"拿旧公式重新算了一遍"。

**没有任何地方在 Formula Maintenance 保存成功后去清空/标记失效 Summary 这两层缓存**——
清缓存的逻辑只挂在"从 Data Capture 提交跳转过来"这一条路径上
（`useDataCaptureSubmitReset.js` 里的 `markSummaryFreshNavigation()`），编辑
Formula Maintenance 完全不会触碰这些 key。

## 3. 修复方案

原则：**Formula Maintenance 的字段（formula、account、currency、source、input method、
description）是配置数据，永远该以最新一次接口请求为准；只有 rate 勾选/数值、批量选中这类
纯前端会话状态才该用本地草稿保留。**

### 3.1 `applySavedRefreshRowToModel` 反转合并优先级

文件：[`lib/summaryRefreshStatePure.js`](../src/pages/datacapturesummary/lib/summaryRefreshStatePure.js)

- 当这一行本次已经匹配到了最新模板（`row.templateApplied === true`）时，config 类字段
  一律优先用 `row.*`（刚 fetch 回来的），`saved.*`（本地草稿）只在 `row.*` 为空时兜底。
- 没匹配到模板的行（比如该 idProduct 已经没有对应公式了）才继续用 `saved.*` 兜底，
  避免变成空白。
- `rateChecked` / `rateValue` / `selectChecked` 这些纯会话状态，逻辑不变，仍然是
  `saved` 优先。
- `baseProcessedAmount` / `processedAmount` 这两个字段其实不用管谁优先——下游
  `mapRowsWithAmountRecalc` 每次都会用当前 `formulaOperators` 重新算一遍，所以只要
  公式本身是新的，金额自然是对的。

### 3.2 去掉 sessionStorage 整行快照的"短路"

文件：[`hooks/useSummaryTableModel.js`](../src/pages/datacapturesummary/hooks/useSummaryTableModel.js)

删掉了"非首次进入就直接回放快照、不调接口"的分支，改成**每次进入 Summary 页面都会走完整的
`populateSummaryRowsPure` 流程**，一定会重新请求 formula-maintenance 接口拿最新公式，
再靠 3.1 的合并逻辑把 rate/勾选这些会话状态合回去。

代价：非首次进入 Summary 页面时会多一次网络请求（原来是纯本地渲染）。这张表涉及金额计算，
正确性优先于这点性能损耗，所以接受这个代价。

连带清理：`loadSummarySessionSnapshotWithFallback` 这个 import、`restoreRateValuesOnRows`、
`mapRowsWithAmountRecalc`、`snapshotScopeCandidates`（`useMemo`）、
`resolveDataCaptureScopeFromSessionMeta` 这几个在这个文件里不再用到的引用一并删掉。
`loadSummarySessionSnapshotWithFallback` 函数本身还留在 `summaryRefreshStatePure.js`
里没删（避免影响其他潜在调用方/后续需要），只是这个文件不再调用它。

## 4. 验证方法

1. 在 Formula Maintenance 改一条已经在用的公式并保存。
2. **不要**从 Data Capture 重新提交（模拟"非首次进入"的场景），直接导航/刷新到
   Data Capture Summary 页面。
3. 对应那一行的 Formula 列和 Processed Amount 应该立刻反映刚才改的新值。
4. 顺便确认 rate 勾选框、手动 select 的状态在刷新前后没有丢——这两个是 3.1 里仍然走
   `saved` 优先的字段，改动不应该影响它们。

## 5. 涉及文件

- [`src/pages/datacapturesummary/lib/summaryRefreshStatePure.js`](../src/pages/datacapturesummary/lib/summaryRefreshStatePure.js)
  —— `applySavedRefreshRowToModel` 合并优先级反转
- [`src/pages/datacapturesummary/hooks/useSummaryTableModel.js`](../src/pages/datacapturesummary/hooks/useSummaryTableModel.js)
  —— 删除 sessionStorage 整行快照短路分支，改为每次都走 `populateSummaryRowsPure`
