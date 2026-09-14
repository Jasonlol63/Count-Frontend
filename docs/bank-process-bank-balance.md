# Bank Process：Bank Balance（一次性 Contra 结余）— 前端设计

Add/Edit Process 弹窗新增一个可选的 "Bank Balance" 金额输入框，填了会自动生成一笔 Customer→
Supplier 的 Contra 交易结平双方之间的零头。这份文档只记录**前端**的设计和实现（后端见 `Count`
仓库的 `docs/bank-process-bank-balance.md`）。

## 涉及文件

- `src/pages/bankprocesslist/components/BankProcessFormModal.jsx`
- `src/pages/bankprocesslist/hooks/useBankProcessListPage.js`
- `src/pages/bankprocesslist/bankProcessListApi.js`
- `src/pages/bankprocesslist/lib/bankProcessHelpers.js`
- `src/pages/processlist/components/ProcessDeleteConfirmModal.jsx`
- `public/css/bankBalanceField.css`（新增，独立文件）
- `src/translateFile/pages/bankProcessTranslate.js`

## 字段位置与三种状态

新字段放在 `BankProcessFormModal.jsx` 里 SOP / Remark 按钮旁边（Detail 列，Insurance 下方），
样式跟 Buy Price / Sell Price 用同一套金额输入模式（`sanitizeBankMoneyTyping` + `blurMoneyField`，
非必填）。

| 场景 | 输入框状态 | 删除按钮 |
|---|---|---|
| Add Process | 空、可编辑 | 不显示 |
| Edit Process，之前没填过 | 空、可编辑 | 不显示 |
| Edit Process，已有关联 Contra 交易 | 只读锁定（灰底，参考现有 Profit 只读字段样式） | 显示，垃圾桶图标 |

锁定判断：`bankBalanceLocked = editMode && form.bank_balance_transaction_id != null`——只有
Edit 模式下、且这一行有关联交易 id 时才锁定，Add 模式永远可编辑。

## 删除交互：立即生效，不需要点 Update Process

点删除按钮 → 弹出确认框（复用 `ProcessDeleteConfirmModal.jsx`，不是浏览器原生 `confirm()`）→
确认后**立即**调用 `deleteBankBalance` 接口删除关联交易 → 成功后输入框立刻变回空、可编辑，
不需要用户再点 Update Process 保存。这个"立即生效"是用户明确要的行为，跟 Accounting Due 弹窗
里 Delete 按钮的交互模式保持一致。

**`ProcessDeleteConfirmModal.jsx` 做了一处向后兼容的泛化**：加了可选的 `titleKey`/`messageKey`/
`messageParams` props（默认值就是原来写死的 `confirmDeleteTitle`/`confirmDeleteMessage`/
`{count}`），原有两处调用（Bank Process 批量删除、Process List 批量删除）完全不受影响，Bank
Balance 的删除确认复用同一个组件，只是传了不同的文案 key。

## CSS：独立文件 + 几处踩过的坑

样式全部放在新建的 `public/css/bankBalanceField.css`，没有混进 `processlist.css`。中途调布局
踩了两个坑，记录一下避免以后重复排查：

**坑 1：改了 `min-height`/`padding` 没生效**。`processlist.css` 里有一条
`#addBankModal .bank-form .bank-input { min-height: 4rem !important; padding: 0.625rem 0.875rem
!important; }`，带 `#addBankModal` 这个 id 选择器 + `!important`，管着这个表单里**所有**的
`.bank-input`。要单独调矮 Bank Balance 这一个输入框的高度，选择器必须同时带上 `#addBankModal`
并且也用 `!important`，普通的类选择器覆盖不管多具体都赢不了它。

**坑 2：按钮和输入框底部对不齐，而且用固定像素硬调会在不同窗口宽度下跑偏**。SOP/Remark 按钮和
Bank Balance 字段（label + 输入框）放在同一个 flex 行里，因为按钮没有 label、天然比字段矮一截，
一开始尝试用 `margin-top: -20px` 之类的固定负值把字段往上拉对齐——这个数字是在某一个具体浏览器
宽度下量出来的，因为按钮/输入框的字号都是 `clamp(..., vw, ...)` 响应式的，换一个窗口宽度这个
硬编码的值就不准了（实际发生过：换了个更宽的窗口后，字段直接被顶到上面 Insurance 那一行去）。

**最终方案**：改用 `align-items: flex-end`，让 flex 布局根据两边"实际渲染出来的高度"自动算
对齐，不管窗口多宽、字号怎么缩放都会自动算对，不再需要手动量像素。输入框内部（输入框 + 删除
按钮）也是同样的问题（删除按钮 34px 比调矮后的输入框高），同样改成 `align-items: flex-end`
解决。这两处都在真实运行的页面上用 JS 量过三种不同窗口宽度（1024/1366/1441px）的实际坐标验证过
才确认对齐。

## 一个中途修的 bug：Edit Process 打开后金额一直显示 0.00

**现象**：Add Process 填了 Bank Balance 并保存成功（后端 Payment History 也确认生成了正确的
Contra 交易），但打开 Edit Process 查看时，Bank Balance 显示的还是空/0.00，没有锁定。

**原因**：`bankProcessHelpers.js` 的 `normalizeBankProcessListItem(dto)` 负责把后端
`/api/bank-process/list` 返回的原始 Spring DTO（驼峰命名 `dto.bankBalance`/
`dto.bankBalanceTransactionId`）转换成前端全局统一用的下划线命名字段（`row.bank_balance`/
`row.bank_balance_transaction_id`），后面所有地方（包括 Edit 表单的 `bankProcessListRowToEditForm`）
都是读转换后的 `row`，不会直接碰原始 DTO。当初只改了"消费方"（`bankProcessListRowToEditForm`
读 `row.bank_balance`），却漏了"生产方"——`normalizeBankProcessListItem` 里一直没有把
`dto.bankBalance` 搬到 `row.bank_balance` 上去，所以不管后端返回什么，`row` 这一层永远是
`undefined`。

**修复**：在 `normalizeBankProcessListItem` 返回对象里补上两行映射：

```js
bank_balance: dto.bankBalance != null ? dto.bankBalance : null,
bank_balance_transaction_id: dto.bankBalanceTransactionId ?? null,
```

## API 层

- `bankProcessListApi.js` 的 `buildBankProcessMutableWriteFields`（Add/Update 共用的字段映射器）
  加了 `bankBalance: toOptionalMoney(form?.bank_balance)`，会随 Add/Update 请求一起提交。
- 新增 `deleteBankBalance({ id, tenantId }, signal)`，对接后端
  `POST /api/bank-process/delete-bank-balance`。

## 没有改动的地方

- Buy Price / Sell Price / Insurance 等既有金额字段的输入模式、校验逻辑完全没动。
- Contract/Insurance 两列布局本身没有重排，Bank Balance 是加在 SOP/Remark 那一行的右侧。

## 已知限制

- 只做过 `vite build` 语法检查和真实页面手动验证（Add → 生成 Contra → Edit 查看锁定 → 删除
  解锁），没有自动化端到端测试覆盖。
