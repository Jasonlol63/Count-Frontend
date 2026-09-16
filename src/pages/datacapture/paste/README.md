# Data Capture 粘贴 — 改动规约

> **一句话规矩：修某一份报表的粘贴问题，只准新增一个 scoped helper；不准改公共解析代码。**

这个目录踩过太多次坑：为了修 A 报表去动通用解析，结果 B、C、D 报表一起坏。
公共代码是所有报表共用的，任何「顺手加一个条件」都是全局副作用。
所以从现在起，**默认动作是加 helper，不是改公共文件**。

---

## 一、两个区域：helper 区 vs 禁区

### helper 区（随便加，加多少个都行）

一个 helper = 一份报表 = 一个文件 + 一个测试文件。互不影响，坏了只坏自己。

| Helper | 认领的报表 |
|---|---|
| `core/dataCaptureGamingSoftInvoicePasteHelper.js` | GamingSoft Excel 发票 |
| `core/dataCaptureKing855WinLossPasteHelper.js` | KING855 Win/Loss |
| `core/dataCaptureWosWinLossDetailPasteHelper.js` | WOS Win/Loss Detail |
| `core/dataCaptureCitibetAgentPtReportPasteHelper.js` | Citibet Agent PT Report（`users_pt_report.jsp`） |
| `core/dataCaptureWinLoseFooterOnlyPasteHelper.js` | fruit16 只有 Sub/Grand Total 的页脚 |
| `core/dataCapturePs38WinLossPasteHelper.js` | PS38 div 网格 |
| `core/dataCaptureC8WinLossPasteHelper.js` | C8 稀疏 tab |
| `core/dataCaptureAllGamesPasteHelper.js` | All Games 垂直堆叠 |
| `core/dataCapturePdfTablePasteHelper.js` | PDF 多空格分列 |
| `vendors/dataCaptureAwcPaste.js` | AWC Win/Loss |

### 禁区（改之前必须先停下来问用户）

这些文件被**所有**报表共用，改一行等于同时改几十种粘贴行为：

| 文件 | 为什么危险 |
|---|---|
| `core/dataCapturePasteMatrixSanitize.js` | 空列裁剪 / 垃圾行丢弃，所有 matrix 都过这里 |
| `core/dataCaptureTotalRowAlign.js` | TOTAL 行补空格，所有含 Total 的报表都过这里 |
| `core/dataCaptureGenericPaste.js` | 2500+ 行 legacy 兜底，谁都可能掉进来 |
| `core/dataCapturePasteDetect.js` | Citibet 自动识别，改判定会抢走别人的剪贴板 |
| `core/dataCaptureTextPaste.js` 的 `finalizePlainMatrix` | 1.TEXT 所有纯文本粘贴的收尾 |
| `core/dataCaptureTextHtmlPaste.js` | 1.TEXT 所有 HTML 粘贴 |
| `core/dataCapturePasteApply.js` | 写入 grid 的最后一步 |

**唯一可以改禁区的情况**：这个 bug 是真·通用 bug（每一种报表都会中招），且已经跟用户说明清楚、拿到确认。
只要说得出「只有 X 报表会这样」，就不是通用 bug，去写 helper。

---

## 二、加一个 helper 的完整步骤

### 1. 建文件 `core/dataCaptureXxxPasteHelper.js`

必须导出三个东西（照抄 `dataCaptureCitibetAgentPtReportPasteHelper.js` 的结构）：

```js
/** 只在确定是这份报表时返回 true。宁可漏判，不可误判。 */
export function looksLikeXxxReport(pastedData, html = "") {}

/** 返回 string[][]；不是这份报表就返回 null。 */
export function tryBuildXxxMatrix(pastedData, html) {}

/** 认领并写进 grid，返回 true；没认领返回 false 让后面的 handler 接手。 */
export function tryHandleXxxPaste(html, pastedData, applyOptions = {}) {}
```

### 2. 识别函数要写「排他条件」

光写「像不像我」不够，还要写「像不像别人」。别人的特征出现就立刻 `return false`：

```js
function looksLikeForeignReport(blob) {
  if (pastedPlainTextLooksCitibetReport(blob)) return true;
  if (/upline\s+payment|downline\s+payment|my\s+earnings/i.test(blob)) return true;
  // …其它报表的独有关键字
  return false;
}
```

**没有排他条件的 helper 一定会抢别人的剪贴板。** 这是这个目录历史上最常见的回归原因。

### 3. 挂到三个入口（顺序要一致）

新 helper 放在 `tryHandleFooterOnlySubGrandPaste`（最宽松的兜底）**之前**：

| 入口 | 位置 |
|---|---|
| 单元格粘贴 | `core/dataCapturePasteHandler.js` 的 1.Text 段 |
| 1.TEXT 纯文本 | `core/dataCaptureTextPaste.js` 的 `parsePlainTextMatrix` + `handleTextModePaste` |
| 2.Format | `core/dataCaptureFormatPasteHandler.js` |

三处顺序必须一致，否则同一份剪贴板在不同模式下会被不同 helper 认领 —— 这正是
「3.CITIBET 正常但 1.TEXT 不对」那类 bug 的根源。

### 4. 写测试 `core/dataCaptureXxxPasteHelper.test.js`

**至少四条**，前两条是功能，后两条是防回归：

```js
test("正常认领并对齐", () => { /* deepEqual 整行，别只测单个 cell */ });
test("Chrome text/plain 拆行也能合并", () => { /* 真实剪贴板往往拆行 */ });
test("别的报表不被认领", () => {
  assert.equal(tryBuildXxxMatrix(其它报表文本, ""), null);
});
test("fruit16 Sub/Grand 页脚不被认领", () => { /* 最容易被误抢的一种 */ });
```

### 5. 跑测试 + build

```bash
cd frontend
node --test "src/pages/datacapture/paste/core/*.test.js"   # 必须全绿，不只是你新加的那几条
npm run build
```

---

## 三、排查顺序（出问题时先看这个，别急着改代码）

同一份剪贴板在不同模式下结果不一样时，**先确认它到底走了哪条路**，再决定改哪里：

1. 剪贴板里有什么？`text/plain` 和 `text/html` 的列数经常不一样 ——
   浏览器复制表格时会丢掉行首的空 `<td>`，`&nbsp;` 却保留成空列。
   很多「列错位」根本不是解析 bug，是两个数据源列数不同。
2. 哪个 helper 认领了？在 `handleTextModePaste` 按顺序看，第一个返回 `true` 的就是。
3. 没有 helper 认领 → 掉到 `dataCaptureGenericPaste.js` 兜底。
   注意：**掉到兜底不代表出错**，很多报表在兜底里恰好是对的，
   这时候正确做法是让 helper 输出跟兜底一致，而不是去改兜底。
4. 确认过是某一份报表独有 → 回到第二节，加 helper 或改它自己的 helper。

---

## 四、验收前必答的三个问题

改完 PR 之前，自己先回答：

- [ ] 我改的文件在 helper 区还是禁区？在禁区的话，用户确认过吗？
- [ ] 我的识别函数会不会误抢别的报表？测试里证明了吗？
- [ ] `node --test "src/pages/datacapture/paste/core/*.test.js"` 全绿了吗？

三个都是「是」才算完成。
