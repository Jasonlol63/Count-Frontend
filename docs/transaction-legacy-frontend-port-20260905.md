# Port 自 legacy PHP 前端的 UI/UX 修复（2026-09-05）

> 来源：`count168test`（legacy PHP 版 React 前端，路径见项目外 `../count168test`）9/2–9/4 期间的一批
> 优化，接续上一次 `port(bank-process): sync UI/perf fixes from legacy PHP frontend`（commit `0e12b43`，
> 见 `docs/bankprocess-list-ui-optimizations.md`）之后未 port 的部分。
>
> 范围限定：只 port **legacy 那边跟 Spring Boot 后端无关的纯前端 UI/计算/文案修复**。legacy 仓库同期还有
> 若干 PHP 后端 API 改动（`api/processes/process_accounting_inbox_api.php`、
> `api/transactions/resend_accounting_due_api.php`、`api/transactions/history_api.php`）和一批
> `c168_mobile/` 独立移动端 UI 大改（`0.5 mobile UI overhaul`）——这两类都不在本次范围内：前者是
> legacy 自己的 PHP 后端，跟 Spring 后端无关；后者是独立的 mobile app，Count-frontend 没有对应产物。
> RATE 计算/文案的两处修复见 [`transaction-rate-springboot-submit.md`](transaction-rate-springboot-submit.md) §5.1
> （因为它跟 Spring 提交映射是同一份文件、同一个上下文，写在那边更合适）。

## 1. Transaction 页 Capture Date 选择器：SPA 路由直达时可能永久失效

**文件**：`src/pages/transaction/hooks/useTransactionDateRange.js`

**问题**：`#calendar-popup` 存在 unconditional 渲染，但触发按钮所在的 `TransactionSearchSection`（`#date-range-picker`
元素）被 `surfaceReady`（等 GC package 数据）挡住，挂载比 `#calendar-popup` 晚。原来的 init 逻辑是一次性
`async` IIFE，如果调用时机撞上这个挂载竞态（尤其是登录后首次 SPA 路由直达本页，`AuthenticatedLayout`/
`AnimatedOutlet` 还没 resolve 完），`init()` 会直接静默放弃，且没有任何后续重试——用户只能手动刷新页面
才能修好 Capture Date。

**修复**：把一次性 IIFE 改成 `tryInit()` 函数 + `MutationObserver` 兜底：
- `tryInit()` 现在多检查一个 `#date-range-picker` 是否已经挂载（不仅仅是 `#calendar-popup`）。
- 首次调用失败时，用 `MutationObserver` 监听 `document.body` 的子树变化，元素出现后自动重试一次
  `tryInit()`，成功后立即断开 observer；组件卸载时也会断开，避免泄漏。

## 2. Payment History PDF 导出：中文字体发灰/变细

**文件**：`src/pages/transaction/lib/paymentHistoryMemberReportExport.js`

**问题一（发灰）**：所有正文/表尾文字颜色用的是 `[15, 23, 42]`（深蓝灰），中文字符渲染出来比英文明显灰、
对比度不够——统一改成纯黑 `[0, 0, 0]`（`styles.textColor`、`footStyles.textColor`，以及 Description/
Remark/金额列等各处内联覆写）。

**问题二（变细/发虚）**：中文字体（`NotoSansCJKsc-VF.ttf`，可变字体）只嵌入了一份 Regular master 就同时
注册成 `"normal"` 和 `"bold"` 两个 style——但 jsPDF 的字体嵌入只认经典 TrueType 大纲（glyf/loca），不支持
可变字体的 `fvar`/`wght` 轴，所以请求 "bold" 时永远只会拿到同一份 Regular 的细字形，跟旁边真正加粗的英文
放在一起显得又灰又细。

**修复**：额外加载一份真正的静态 Bold TrueType 字重（`NotoSansSC-Bold.ttf`，Google Fonts 提供，同一
Noto Sans SC 字源切出来的 Weight 700 版本），单独注册为该字体族的 `"bold"` style：
- 新增 `PDF_CJK_BOLD_FONT_FILE` / `PDF_CJK_BOLD_FONT_URLS` 常量、`pdfCjkBoldFontBase64Promise` 缓存。
- `fetchPdfCjkFontBase64()` 泛化重命名为 `fetchPdfFontBase64(urls)`（现在两种字体共用同一个抓取函数）。
- 新增 `addFontToVfsOnce(doc, file, base64)` 去重 `addFileToVFS` 调用。
- `ensurePdfExportFont()`：Regular 字体加载失败直接 fail（跟以前一样）；Bold 字体加载失败则 **降级**回退到
  用 Regular 文件注册 "bold" style（还是细，但导出不会因为网络问题整个失败）。
- 因为现在有真 Bold 字形了，之前为了"避免合成加粗显灰"而对 CJK 单元格降级成 `fontStyle: "normal"` 的
  临时处理（`isCjkCell ? "normal" : "bold"`）全部撤掉，中文/非中文单元格统一用 `"bold"`。

## 3. 涉及文件

- `src/pages/transaction/hooks/useTransactionDateRange.js`
- `src/pages/transaction/lib/paymentHistoryMemberReportExport.js`
- （RATE 计算/文案两处修复见 `transaction-rate-springboot-submit.md` §5.1，涉及
  `src/pages/transaction/lib/transactionSubmitHelpers.js`）

## 4. 未 port 的部分（记录原因，避免以后重复调查）

| Legacy commit | 内容 | 不 port 的原因 |
|---|---|---|
| `ef11ffc1a` | `process_accounting_inbox_api.php`：过期 active 合约继续计费 | legacy PHP 后端逻辑，跟 Spring 后端无关 |
| `c6a75c17c` | `resend_accounting_due_api.php`：resend 报错 | 同上 |
| `a1d5da2a7` / `1f28b6801`(部分) / `7fe7cb6d7` | `history_api.php`：middle man desc 反复改了又撤回，最终净效果=无变化 | 同上，且净 diff 为 0 |
| `a8957ccf7` | `BankProcessTable.jsx`：Day End 未填时用合约期限推算隐含到期日 | **Count-frontend 已经有**（上一次 `4daeca6` port 已覆盖同一段 `getContractStateClass`/`renderBankContract` 逻辑），逐行核对过一致，无需改动 |
| `e76567a33` 及其相关 merge | `0.5 mobile UI overhaul` | 完全在 `c168_mobile/` 独立移动端 app 里，Count-frontend 没有对应的 mobile 产物 |
