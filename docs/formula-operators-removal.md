# 移除 formula_operators 冗余字段（2026-08-20）

> 范围：`data_capture_formula` 表里 `formula` / `formula_operators` 两个字段本该永远同步，
> 但 Formula Maintenance 的保存接口只写了 `formula`，导致改公式不影响实际计算结果。
> 本次直接把 `formula_operators` 从整条链路（DB 列、后端 entity/DTO/MyBatis、前端 row model/
> 保存/计算逻辑）里删掉，只保留 `formula` 一个字段。
>
> 这是 [summary-formula-refresh-fix.md](./summary-formula-refresh-fix.md) 那次修复的后续——
> 那次修的是前端缓存不刷新；这次修的是即使缓存刷新了，读到的字段本身也可能是错的。
> 两个问题独立存在，都需要修。

---

## 1. 为什么要删，而不是把 Formula Maintenance 保存接口补全

一开始的想法是让 Formula Maintenance 的保存接口也把 `formula_operators` 一起写上（照抄
`formula` 的值），风险最小。但排查后发现：**这两个字段在现在这套代码里，从来没有被设计成
可以存不同内容**——每一条正常工作的保存路径（Summary 自己的 Edit Formula 弹窗、批量改
Source 列等）都是把同一个值同时塞进 `formula` 和 `formulaOperators`：

```js
// summarySaveTemplatePure.js（改之前）
const formula = row.formulaOperators || row.formula || "";
const body = { ..., formula, formulaOperators: formula, ... };
```

唯一"写少了"的就是 Formula Maintenance 那条路径。也就是说，`formula_operators` 当前
100% 是历史包袱（迁移文档里也承认是"旧 PHP 时代遗留"），不是有意的设计。既然两个字段永远
该相等，留着第二个字段只是多一个出错的地方——干脆删掉，`formula` 变成唯一真相来源，
从根上让"两个字段没同步"这种 bug 不可能再发生。

## 2. 后端改动（`Count` 仓库）

| 文件 | 改动 |
|---|---|
| [schema.sql](../../Count/backend/src/main/resources/sql/schema.sql) | `data_capture_formula` 表 `CREATE TABLE` 里删掉 `formula_operators` 这一列定义 |
| [migrate_drop_formula_operators.sql](../../Count/backend/src/main/resources/sql/migrate_drop_formula_operators.sql) | **新增**的迁移脚本，`ALTER TABLE ... DROP COLUMN formula_operators`，幂等（列不存在时跳过）。**没有自动执行**，需要你自己手动跑一次对齐现有数据库 |
| [MaintenanceMapper.xml](../../Count/backend/src/main/resources/mybatis/MaintenanceMapper.xml) | Formula Maintenance 列表查询去掉 `formula_operators` 这一列 |
| [DataCaptureSummaryMapper.xml](../../Count/backend/src/main/resources/mybatis/DataCaptureSummaryMapper.xml) | resultMap、共用 SELECT 片段、`insertFormula`、`updateMainFields`、`updateFormulaById` 全部去掉这一列 |
| `DataCaptureFormula.java` / `MaintenanceFormulaDTO.java` / `DataCaptureSummaryDTO.java` | 删掉 `formulaOperators` 字段 |
| `DataCaptureSummaryServiceImpl.java` | 删掉所有 `request.getFormulaOperators()` 兜底分支、`saveAsMain`/`saveAsSub`/`updateFormula` 里的 `formulaOperators` 参数和 `setFormulaOperators(...)` 调用；`updateFormula` 里那条四层兜底链（`request.formula → request.formulaOperators → existing.formula → existing.formulaOperators`）简化成两层（`request.formula → existing.formula`） |

用 `mvn compile`（强制全量重编译）验证过，`BUILD SUCCESS`。

**数据库这一步需要你自己执行**：

```bash
mysql -u <user> -p <database> < backend/src/main/resources/sql/migrate_drop_formula_operators.sql
```

不执行也不影响功能——代码已经完全不读/不写这一列了，只是列还留在表里占地方。执行了才算真正"删干净"。

## 3. 前端改动（`Count-frontend` 仓库）

核心计算路径（最关键，直接对应之前那个 bug）：

- [summaryRowAmount.js](../src/pages/datacapturesummary/table/summaryRowAmount.js)
  `resolveFormulaTextForCalculation` 不再读 `row.formulaOperators`，改读 `row.formula`——
  这是算 Processed Amount 时真正取值的地方。
- [resolveFormulaForDisplay.js](../src/shared/formula/resolveFormulaForDisplay.js)
  `resolveEffectiveSourcePercentForRow` / `resolveTemplateFormulaBaseAndPercent` 原本读的是
  `row?.formula_operators`（原始模板/API 对象上的字段，从来没有 fallback 到 `formula`），
  改成读 `row?.formula`。
- [summaryRowData.js](../src/pages/datacapturesummary/table/summaryRowData.js)
  `applyMainTemplateToRowModel` 里解析模板公式那段，原本 `mainTemplate.formula_operators ||
  mainTemplate.formulaOperators` 两个 fallback 全删，改成读 `mainTemplate.formula`；
  row model 上不再有 `formulaOperators` 这个字段。

其余都是跟着 row model 字段改名走的"安全重命名"（这些文件里 `formula`/`formulaOperators`
本来就总是被写成同一个值，删掉多余的那份纯粹是清理）：

`summaryApi.js`（API 响应映射）、`summaryRefreshStatePure.js`（草稿快照/合并逻辑）、
`summaryTemplatePopulatePure.js`、`summarySaveTemplatePure.js`（保存请求体）、
`buildSubmitRowsFromModel.js` / `summarySubmitExecution.js`（提交请求体）、
`summaryBatchSourceColumns.js`、`editFormulaFormState.js` / `summaryInlineEditPure.js`
（Edit Formula 弹窗 / 双击行内编辑）、`useSummaryEditFormulaPure.js`、
`summaryTemplateFormulaDisplay.js` / `summaryTemplateSourceData.js`（内部只有一处
`template?.formula_operators` 原始读取需要改成 `template?.formula`，其余出现的
`formulaOperators` 都只是这两个文件内部函数的参数名，跟外部字段无关，没有改的必要）、
`SummaryTableRow.jsx`（一个已经没人读的 DOM data 属性，顺手改成读 `row.formula`）。

**没有动的**：`src/shared/formula/resolveFormulaForSave.js`、`scoreTemplateForDedup.js`
里还留着 `formula_operators`/`formulaOperators` 字样，但这两个文件排查确认**全项目零调用方**
（只在 `shared/formula/index.js` 里被重新导出，从没被任何页面真正 import 使用），是死代码，
不影响功能，故意没动以免无谓扩大改动范围。

用 `npx vite build` 跑过一次完整生产构建（1830 个模块），`✓ built`，没有报错。

## 4. 验证方法

跟上一份文档（[summary-formula-refresh-fix.md](./summary-formula-refresh-fix.md)）第 4 节
的步骤一样：改 Formula Maintenance 的 Formula → 非首次进入 Summary 页面 → 确认新公式和新
Processed Amount 立刻生效。这次即使某个历史数据行的 `formula_operators` 列早就跟
`formula` 不一致，也不会再影响结果，因为代码根本不读那一列了。

## 5. 涉及文件

后端（`Count`）：
- [schema.sql](../../Count/backend/src/main/resources/sql/schema.sql)
- [migrate_drop_formula_operators.sql](../../Count/backend/src/main/resources/sql/migrate_drop_formula_operators.sql)（新增，需手动执行）
- [MaintenanceMapper.xml](../../Count/backend/src/main/resources/mybatis/MaintenanceMapper.xml)
- [DataCaptureSummaryMapper.xml](../../Count/backend/src/main/resources/mybatis/DataCaptureSummaryMapper.xml)
- `DataCaptureFormula.java` / `MaintenanceFormulaDTO.java` / `DataCaptureSummaryDTO.java`
- `DataCaptureSummaryServiceImpl.java`

前端（`Count-frontend`）：
- `summaryRowAmount.js`、`resolveFormulaForDisplay.js`、`summaryRowData.js`（核心计算/解析路径）
- `summaryApi.js`、`summaryRefreshStatePure.js`、`summaryTemplatePopulatePure.js`、
  `summarySaveTemplatePure.js`、`buildSubmitRowsFromModel.js`、`summarySubmitExecution.js`、
  `summaryBatchSourceColumns.js`、`editFormulaFormState.js`、`summaryInlineEditPure.js`、
  `useSummaryEditFormulaPure.js`、`summaryTemplateFormulaDisplay.js`、
  `summaryTemplateSourceData.js`、`SummaryTableRow.jsx`
