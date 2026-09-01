# Bank Process List：前端 UI / 效能优化移植记录

> 适用范围：`src/pages/bankprocesslist/`（BankProcessListPage 及其 hook/components）、`src/pages/maintenance/bankprocess/`（BankprocessMaintenancePage 及其 filters 组件）与相关 CSS
> （`processCSS.css` / `processlist.css` / `userlist.css`）、共用日期选择器 `utils/date/dateRangePicker.js`。
> 这份文件记录从旧版 PHP 前端（`count168test`）移植过来的、跟后端出账逻辑无关、纯前端 UI／效能相关的优化。
> 出账/Resend 相关的规则见 `frontend-springboot-migration.md`（后端仓库）。

---

## 1. Filter chips：不收进漏斗图标，永远完整展示

**背景**：本仓库这一版曾经加过 `useBankProcessFilterCollapse`（ResizeObserver 动态量测），窄屏下把 Show All / Active / Inactive / Official / E-Invoice / Blocked 这排 filter chip 收进一颗漏斗图标，点开才有 dropdown。旧版 PHP 前端最终改回「任何宽度都直接 inline 完整显示」，不再有收合状态。

**处理**：按旧版对齐，移除收合机制。

- 位置：[`BankProcessListPage.jsx`](../src/pages/bankprocesslist/BankProcessListPage.jsx)。移除了 `useBankProcessFilterCollapse` hook 调用与 import、`filterPanelOpen` 状态、漏斗按钮点击/双击/外部点击关闭/Esc 关闭这些逻辑，以及隐藏的量测用 DOM clone；`BankProcessFilterChips` 永远用 `layout="inline"`。
- **Search bar 的收合行为完全没动**（`isNarrowToolbar` / `window.matchMedia("(max-width: 1699px)")` 驱动，跟 filter 是独立机制）：小屏幕还是图标形态，点了才展开成输入框。
- Filter chips 的英文标签同步对齐：`showActive`/`showInactive`/`showOfficial`/`showEInvoice`/`showBlock` 去掉 "Show" 前缀（`Active`/`Inactive`/`Official`/`E-Invoice`/`Blocked`），只有 `showAll` 保留 "Show All"。位置：[`bankProcessTranslate.js`](../src/translateFile/pages/bankProcessTranslate.js)（仅 `en` 段，`zh` 段旧版本来就没改，维持「显示启用」等原样）。

### 1.1 副作用：窄屏 filter chips 出现横向 scroll，加了响应式缩小

因为 chips 永远 inline，窄屏下总宽度可能超出可用空间，容器本身有 `overflow-x:auto` 的 fallback（本来就有，不是新加的），但体验上会出现横向 scrollbar。

- 位置：[`userlist.css`](../public/css/userlist.css)（`.userlist-filter-chips--bank-process` 这套 chip 样式，跟 User List / Account List 共用同一份基底样式，只是叠加了 `--bank-process` 修饰）。
- `@media (max-width: 1349px)` / `@media (max-width: 1199px)` 两级：字号、padding、chip 间距、圆点/勾勾图标尺寸改用**固定紧缩数值**（不是 `clamp(..., vw, ...)`），一跌破门槛立刻缩到位；同时拿掉每颗 chip 原本为了「切换中英文语言时 chip 宽度不跳动」而预留的固定 `min-width`，改成贴合当前文案实际长度。

---

## 2. Search bar：窄屏展开后的宽度缩短

- 位置：[`processCSS.css`](../public/css/processCSS.css)，`@media (max-width: 1699px)` 内 `.bank-process-search-bar.is-expanded` 的宽度：`clamp(220px, 18vw, 320px)` → `clamp(150px, 11vw, 210px)`，避免展开后挤压其他 toolbar 控件。收合状态（仅显示放大镜图标）没有变动。

---

## 3. Date range 跨页面污染：从 Dashboard 切到 bankProcess 会误显示 Dashboard 的日期

**现象**：从 Dashboard（已选好一个日期范围，例如「今天」）切到 Process 页面时，bankProcess 自己的 Date range 药丸会显示 Dashboard 选的日期，而不是清空／预设空白。bankProcess 自己读 URL query 算出来的 React state（`dateFrom`/`dateTo`）其实是空的，但画面显示的文字不是空的。

**根因**：日期选择器 `window.MaintenanceDateRangePicker`（[`utils/date/dateRangePicker.js`](../src/utils/date/dateRangePicker.js)）是整个 SPA 共用的单例（模块级闭包变量，SPA 路由切换不会重建）。里面有个 `stashedCommittedRange`（`preserveDisplayUntilCommit` 模式下，防止「重选日期期间」画面被清空的暂存值），这个值只有 `clearSelection()` 才会清掉，**`init()` 完全不会重置它**。Dashboard 那边只要曾经触发过一次「已提交范围」的画面绘制，这个 stash 就会残留下来；bankProcess 挂载时就算把隐藏栏位跟 `calendarStartDate` 都正确清空了，`updateDateRangeDisplay()` 因为 `preserveDisplayUntilCommit: true` 还是会优先去画这个残留的 stash，把画面盖回 Dashboard 的日期。

**修复**：[`dateRangePicker.js`](../src/utils/date/dateRangePicker.js) 的 `init(options)`：一开始就把 `stashedCommittedRange = null` 和 `isSelectingRange = false`——`init()` 代表有页面（可能跟上次不同）要接管这个共用单例，先前残留的「选取中预览」快取到这里已经过期，不该带过去。这是修在共用元件的根源，所有用到这个 picker 的页面都受益。

---

## 4. Edit Process modal 滚动效能

### 4.1 状态下拉选单的 scroll 监听没有节流

`BankProcessStatusControl.jsx`（ACTIVE/INACTIVE 那颗状态下拉选单）打开时挂的 `scroll`/`resize` 监听，原本每个事件都同步跑 `getBoundingClientRect()`（强制版面计算）+ `setState`（触发重渲染），是典型的 layout thrashing，快速滑动时容易在效能较弱的设备上掉帧——同一个 modal 里另一个很像的下拉选单（`bankProcessFormFields.jsx` 的 `BankSearchableAccountPick`）一并处理。

- 位置：[`components/BankProcessStatusControl.jsx`](../src/pages/bankprocesslist/components/BankProcessStatusControl.jsx)、[`components/bankProcessFormFields.jsx`](../src/pages/bankprocesslist/components/bankProcessFormFields.jsx)。改成用 `requestAnimationFrame` 合并，每一帧最多重新量一次版面，而不是每个 scroll 事件都同步跑。
- 只在「下拉选单开着、同时在滚动」时才会生效；如果卡顿是在没开任何下拉选单、纯滚动 modal 内容时发生，这个修复不会有感觉，要看下一项。

### 4.2 短滚动区域快速滑动「撞底」的突兀感

**现象**：Edit Process modal 内容较短时，快速甩动滑动，内容几乎立刻到底，减速动画被硬生生截断，视觉上容易被误读成「卡了一下」（并非真的掉帧）。

**做法**：不去人为拖慢滚动速度（会破坏触控 1:1 跟手的原生体验，且需要用 JS 接管原生滚动，风险比原问题更高），改成在可滚动区域底部**加大留白**，让内容有更长的「跑道」，减速动画比较有机会自然收尾；同时给可滚动区域补上 iOS 惯性滚动 (`-webkit-overflow-scrolling: touch`) 和 `overscroll-behavior: contain`（防止滚到边界时穿透到底下的元素），并去掉外层 `.bank-modal.modal` 冗余的 scroll fallback（跟内层 `.bank-form-fields-scroll` 的滚动区域重复，移动端两层滚动容器叠加是常见卡顿源）。

- 位置：[`processlist.css`](../public/css/processlist.css)，`.bank-modal.modal`、`#addBankModal .bank-form-fields-scroll`。
- **留白只在需要滚动的矮屏幕才套用**：这段留白放进既有的 `@media (max-height: 820px)` 断点里（`10px` → `15px`），跟这个 modal 本来就用来判断「屏幕矮到需要压缩间距」的断点共用。视窗高度 > 820px（内容本来就完整可见、不需要滚动）完全不受影响，不会平白多出卷轴和空白。

---

## 5. Resend 按钮：除 inactive 外所有状态都显示

**背景**：旧版原本 Resend 按钮只在 status 为 `active` 且没有 issue_flag（非 Official/E-Invoice/Block）时才显示。旧版后来放宽为「除 inactive 外都显示」，Official/E-Invoice/Block 这些状态也能用 Resend；本仓库此前还是旧逻辑，未跟进。

**处理**：按最新旧版逻辑对齐，功能本身（Resend 弹窗、提交、锁定判断）不变，只放宽按钮的显示条件。

- 位置：[`lib/bankProcessHelpers.js`](../src/pages/bankprocesslist/lib/bankProcessHelpers.js) 的 `canShowBankResend(row)`：从 `s === "active" && !isBankInactiveLike(row?.status, row?.issue_flag)` 改成 `s !== "inactive"`。
- `isBankInactiveLike` 仍保留导出（跟旧版一致），只是这个判断点不再用它，目前仓库内没有其他调用点。

---

## 6. Bank Process List：自动分页尺寸不该跟着 currentPage 重算

**背景**：`useAutoListPageSize` 会按可视区域实际渲染出来的行高反推每页能放几行。旧版故意把 `currentPage` 排除在 `remeasureDeps` 之外并留了注释：如果按"当前正显示的这一页"的 DOM 行去重新测量，用户停在最后一页（往往只有部分行）时，量出来的行高样本会跟满页不同，算出的 `pageSize` 可能变小 → `totalPages` 跟着缩水 → 用户被"弹"离最后一页。本仓库这一版曾经把 `currentPage` 加回了依赖数组，注释也被删掉。

**处理**：按旧版对齐，移除 `currentPage`，恢复原注释。

- 位置：[`hooks/useBankProcessListPage.js`](../src/pages/bankprocesslist/hooks/useBankProcessListPage.js) 的 `useAutoListPageSize({ ..., remeasureDeps })`。

## 7. Bank Process List：货币 pill 拖拽排序恢复跨页面广播

**背景**：工具栏货币 pill 支持拖拽调整顺序。旧版拖拽后除了持久化到当前 company 的顺序，还会调用 `persistUserCurrencyDisplayOrder(next)` 把新顺序写成"用户全局顺序"，让 Dashboard / Transaction 等其他页面的货币排序跟着同步。本仓库这一版少了这一句，拖拽只影响 Bank Process List 自己。

**处理**：按旧版对齐，补回 `persistUserCurrencyDisplayOrder(next)` 调用（及对应 import）。

- 位置：[`hooks/useBankProcessListPage.js`](../src/pages/bankprocesslist/hooks/useBankProcessListPage.js) 的 `onCurrencyPillDrop`。

---

## 8. Bank Process Maintenance：跨页面货币筛选联动 + 拖拽排序

**背景**：Maintenance 页面（跟 List 页面是姐妹页，各自独立维护状态）此前完全没有接上"跨页面货币同步"这一整套机制，货币筛选是纯页面本地状态，跟 Dashboard/Transaction/Reports 等页面互不联动，也不能拖拽调整货币筛选顺序。List 页面本身一直都有这套联动（`useCrossPageCurrencySync`），Maintenance 页面漏掉了。

**为什么可以直接照旧版搬、不用重新设计**：这几个工具函数（`useCrossPageCurrencySync`、`currencyDisplayOrder.js` 的 order 相关函数、`transactionApi.js` 的 `saveUserCurrencyOrder`/`getUserCurrencyOrder`）在 Spring Boot 迁移里已经改成纯前端 localStorage 实现，不发任何请求（`saveUserCurrencyOrder` 源码注释：`Spring has no user-level currency order API; persist in localStorage`）。跟"后端 API 格式"完全没有交集，List 页面就是这套东西在当前 Spring Boot 前端上跑通的现成参照。

**处理**：照 List 页面同款接线搬到 Maintenance 页面。

- 位置：[`BankprocessMaintenancePage.jsx`](../src/pages/maintenance/bankprocess/BankprocessMaintenancePage.jsx)。
  - 恢复 `orderBankprocessCurrencyRows()`，套用在两处 `setCurrencies(...)`（初始加载 + companyId 变化重新拉取），让货币列表按已保存的跨页面顺序显示。
  - 恢复 `userSelectedAllCurrencyRef` guard ref，配合 `useCrossPageCurrencySync` 的 `respectEmptyRef`，防止用户显式选"全部"后被联动逻辑覆盖回单一货币。
  - 恢复 `bankprocessCurrencyCodes` memo、`applyCrossPageCurrency`、`useCrossPageCurrencySync({...})` 接线，拿到 `persistCrossPageCurrency`。
  - `toggleBankprocessCurrency` 补回 `persistCrossPageCurrency(...)` / `clearDashboardSelectedCurrency()` 广播。
  - `selectAllBankprocessCurrencies` 补回 guard ref 设置和 `clearDashboardSelectedCurrency()`。
  - 恢复 `handleCurrencyDropOn`（拖拽排序 + `persistUserCurrencyDisplayOrder` + `persistCurrencyDisplayOrder` + `saveUserCurrencyOrder`），通过新增的 `onCurrencyDropOn` prop 传给 [`BankprocessMaintenanceFilters.jsx`](../src/pages/maintenance/bankprocess/components/BankprocessMaintenanceFilters.jsx)，再由它转给 `ReportGcFilterPanel` 的 `currencyDraggable` + `onCurrencyDropOn`。
- **唯一保留的新版差异**：`onConfirmDelete` 里 `deleteBankprocessData(selectedIds, companyId)` 比旧版多传一个 `companyId`（`tenantId`）——这是 Spring 删除接口要求的参数，跟本次移植的功能无关，特意保留没有还原成旧版的单参数调用。

---

## 已知限制 / 未覆盖

- 第 1.1 节的响应式缩小是用固定的宽度断点（1349px / 1199px）调出来的，没有实机在所有装置尺寸穷举验证。
- 第 4.2 节的「撞底突兀感」目前只用加大留白处理；如果加大留白后感觉仍不够，下一步要查撞底那一刻是不是缺少原生 rubber-band 回弹（需要在真机上测）。
- 这几项改动都只在自动化 `vite build` 做过语法检查，没有自动化 UI 测试覆盖，上线前建议依本文件逐项在目标设备上手动过一遍。
