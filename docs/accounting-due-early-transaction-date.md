# Accounting Due：提前交易日期（Early Transaction Date）— 前端设计

Accounting Due 弹窗新增一个日期选择器：用户可以选今天~今年年底之间的任意一天，预览到那一天
为止会有哪些账单到期，并直接对提前出现的账单执行入账。这份文档只记录**前端**的设计和实现
（后端见 `Count` 仓库的 `docs/accounting-due-early-transaction-date.md`——后端本来就已经支持
`asOf` 参数，这次前端只是把它从"开发者调试专用"接上成正式 UI，后端只补了一处范围校验）。

## 涉及文件

- `src/pages/bankprocesslist/components/AccountingDueModal.jsx`
- `src/pages/bankprocesslist/components/AccountingDueDatePicker.jsx`（新增）
- `src/pages/bankprocesslist/hooks/useBankProcessListPage.js`
- `src/pages/bankprocesslist/bankProcessListApi.js`
- `public/css/accountingDueDatePicker.css`（新增，独立文件）
- `src/translateFile/pages/bankProcessTranslate.js`

## 设计 1：日历组件做成完全独立的组件，不复用全局共用日历

`AccountingDueModal.jsx` 一开始是用原生 `<input type="date">` 做的日期选择（能拿到浏览器原生的
`min`/`max` 范围限制），但视觉上跟应用其他地方用的那套自定义日历（`utils/date/dateRangePicker.js`
+ `date-range-picker.css`，Bank Process 表单 Day Start/Day End 也用这个）不一致。

**为什么不直接换成共用的那套日历**：排查发现 `dateRangePicker.js` 完全没有 min/max 日期限制的
能力（连 `data-min-ymd` 这种已有的 data 属性都是从来没人读取的死代码）。真要做"只能选今天~今年
年底"，要嘛在应用层做选完再拒绝的校验（体验差——点了才被拒绝，而不是一开始就点不了），要嘛去改
这套全应用共用的日历引擎（Bank Process 表单、报表筛选等到处都在用，改动面和回归风险都大）。

**最终方案**：新建 `AccountingDueDatePicker.jsx`，是一个完全独立的单日期日历组件：

- 自己实现月份网格渲染、上/下月导航、月份下拉（自绘的按钮+列表，不是原生 `<select>`——原生下拉
  弹出层没法自定义字体/配色，跟应用整体风格不搭）。
- **范围外的日期在网格层面就是禁用状态**（灰色、`disabled`、点不了），不是选完再校验拒绝。
- 视觉上照抄共用日历的配色（`#3b82f6` 蓝色、`#d1d5db` 灰色边框等），但用全新的 `accounting-due-cal-*`
  class 名，跟 `dateRangePicker.js`/`date-range-picker.css` 完全没有交集——改这个组件不会影响任何
  其他用到共用日历的页面，反之亦然。
- 因为可选范围（今天~今年年底）永远落在**同一个日历年**内，月份导航天然只会横跨同一年，所以没有
  做年份下拉——月份下拉直接显示"Sep 2026"这种带年份的完整选项，避免做一个只有一个选项、形同虚设
  的年份选择器。
- CSS 单独放在 `public/css/accountingDueDatePicker.css`，没有混进 `processlist.css`（按要求独立
  维护）。

## 设计 2：范围 = 今天 ~ 今年 12 月 31 日，自动跨年

最开始只做了"今天~未来一个月"，后来按要求扩到"今天~今年年底"。`maxAsOfIso` 用
`endOfYearIso(new Date())` 现算，不是写死某一年，所以到了明年这个范围会自动变成"今天~明年
年底"，不需要改代码。

日期选择器旁边还有一排快捷 chip：今天 / +1 周 / +2 周 / +1 月 / 年底，点了直接跳转，不用每次都
翻日历。

## 设计 3：区分"今天到期" vs "提前预览出来的"

选了未来日期后，界面上有几处提示避免用户误操作：

- 弹窗标题徽标旁加日期后缀（`Accounting Due [9] · as of 09-20`）。
- 表格上方出现一条提示条，说明当前显示的是哪个日期视角下的账单。
- 每一行如果是"因为选了未来日期才提前出现"的（`posted_date` 晚于真实今天），左侧加一条橙色竖条
  + "Early" 徽标；这个判断纯前端计算（比较 `row.posted_date` 和真实今天的日期字符串），不需要
  后端额外返回字段。
- 空状态文案区分"今天没有待入账"和"该日期没有待入账"两种情况。

## 一个中途修的 bug：日期一选就把整个日期栏弄丢

**现象**：点了某个日期/chip 后，日期选择器整个消失，要关掉弹窗重开才会恢复。

**原因**：`useBankProcessListPage.js` 的 `loadAccountingInbox` 一开始把 `accountingAsOfDate`
（选中的预览日期）直接放进了 `useCallback` 依赖数组，导致每次选日期这个函数的引用就会变——而
这个函数同时被好几个**跟日期选择器完全无关**的 `useEffect` 依赖着（比如"跨页面公司会话同步"那个
effect）。函数引用一变，那些 effect 全部被误触发一遍，其中的公司会话同步逻辑把界面状态搅乱了。

**修复**：改用 `accountingAsOfDateRef`（跟同文件里 `companyIdRef`一样的写法）在内部读最新值，
`loadAccountingInbox` 的依赖数组去掉 `accountingAsOfDate`，函数引用只在 `companyId` 变化时才变，
跟改之前的行为完全一致，不会再牵连其他 effect。

## API 层：`asOf` 怎么传下去

`bankProcessListApi.js` 的 `fetchAccountingDueInbox(tenantId, signal, { asOf, restoreSkipped })`
本来就支持 `asOf` 参数（连开发者调试常量 `ACCOUNTING_DUE_AS_OF_OVERRIDE` 都已经留好了），这次
只是把它从"写死 `null`"改成"由 UI 选中的日期驱动"，`useBankProcessListPage.js` 新增
`accountingAsOfDate` state + `setAccountingAsOf` handler，选中/重置日期时都会重新拉取一次列表。

## 已知限制

- 只在 `vite build` 层面做过语法检查，没有自动化 UI 测试；不同浏览器窗口宽度下的换行/对齐已经
  用真实页面 + JS 量过坐标验证，但没有做全量响应式断点扫描。
- COMPENSATION 类型（1+N 合同的补偿账单）不受这个预览日期影响，`BankProcessListPage` 里对提前
  出现的行只判断"是否早于真实今天"，不区分类型——如果以后要单独处理 COMPENSATION，需要在这里
  额外加判断。
