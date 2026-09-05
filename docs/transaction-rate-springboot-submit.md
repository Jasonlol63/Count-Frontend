# RATE 提交 → Spring Boot 映射（现行）

> 范围：`/transaction` 页面 RATE 表单提交到 `POST /api/transaction/submit` 的完整链路。
> 后端实现细节（`resolveMiddleman` 决策树、Rate-Mul 算法、Fee/Platform Fee 语义、schema）见
> [`Count/docs/transaction-rate-middleman-logic.md`](../../Count/docs/transaction-rate-middleman-logic.md)——
> 本文档只讲前端这一侧：表单校验、payload 怎么拼、字段怎么映射到 Spring DTO。
>
> RATE 表单**字段字典 / 即时计算 / Description 规则**等仍以 `docs/transaction-rate-manual-logic.md`、
> `docs/transaction-rate-service-platform-fee.md`（legacy PHP 参考文档，路径见项目外的
> `count168test/docs/`）为准；本文档只覆盖"提交到 Spring 这一段"跟那两份文档不一样的地方。

---

## 1. 跟 legacy PHP 文档的关键差异：第二组账户现在是必填

RATE 表单有两组"Select To/From Account"：

```text
┌─ 第一组账户 ─────────────────────┐   ← 第一币种（leg1）
┌─ 货币行 ─────────────────────────┐
┌─ 第二组账户（Transfer）──────────┐   ← 第二币种（leg2）—— 现在强制必填！
┌─ Middle-Man ─────────────────────┐   ← 仍然可选
```

legacy PHP 文档里"第二组账户可选，不填就只有第一币种那一笔账"这个规则**不适用于 Spring 提交路径**——Spring Boot 的 `transactions_rate.leg2_transaction_id` 是必填外键，一定要有一笔真实的第二币种 Cr/Dr。所以 `useTransactionForm.js` 的 `onSubmitTx` 在选完两种货币之后、算金额之前，新增了这段校验：

```js
const transferToId = rateTransferToAccount?.id ? String(rateTransferToAccount.id) : "";
const transferFromId = rateTransferFromAccount?.id ? String(rateTransferFromAccount.id) : "";
if (!transferToId || !transferFromId) {
  pushToast(m.pleaseSelectRateTransferAccounts, "error");
  return;
}
```

Middle-Man（账户 + Rate-Mul / Fee / Platform Fee）依然完全可选，三选一或三个都不填都合法——这点跟 legacy 文档一致，没有变化。

---

## 2. `buildRatePayload` 里的两套字段

`transactionSubmitHelpers.js` 的 `buildRatePayload()` 现在同时产出两套字段：

1. **legacy PHP 风格字段**（`account_id` / `rate_from_account_id` / `rate_transfer_from_account_id` / `rate_middleman_amount` 等）——**保留不动**，给 description/remark 生成用，也因为这个文件跟 mobile（`c168_mobile/frontend/src/lib/transactionSubmitHelpers.js`）共用同一套算法，删掉可能影响 mobile 那边还在用的路径。
2. **Spring 专用字段**（本次新增，命名不含糊）——`buildSpringSubmitRequest` 只读这一套，不再去猜 legacy 字段：

```text
leg1_to_account_id / leg1_from_account_id / leg1_currency / leg1_amount
leg2_to_account_id / leg2_from_account_id / leg2_currency / leg2_amount   ← 只有第二组账户都选了才有（现在恒有）
rate_expression        FX 原始文本，如 "/1.5"（以前从来没传过，Rate-Mul 除法模式因此一直失效）
exchange_rate           数值化汇率

middleman_account_id
middleman_rate_expression    Rate-Mul 原始文本，如 "/1.55"（保留 "/" 前缀，不转成裸除数）
middleman_fee_amount         Fee 面值，第二币种
middleman_platform_fee_amount
```

**不要**从 legacy 字段里反推 Spring 字段——两套字段的语义不总是一一对应（见下一节的坑）。

---

## 3. `leg2_amount` 必须复刻后端的 `expectedNet` 公式

后端校验：`leg2Amount` 必须精确等于 `grossTo − (ratePortion(若>0) + feePortion(若>0))`，`feePortion = Fee − PlatformFee`（同样只在 >0 时计入）。前端在 `buildRatePayload` 里按同一公式重新算了一遍：

```js
const ratePortionForLeg2 = rateMulDec.gt(0) ? rateMulDec : MoneyDecimal.toDecimal("0", 0);
const feeNetForLeg2 = serviceFeeDec.minus(platformInputDec);
const feePortionForLeg2 = feeNetForLeg2.gt(0) ? feeNetForLeg2 : MoneyDecimal.toDecimal("0", 0);
const leg2AmountDec = grossDec.minus(ratePortionForLeg2).minus(feePortionForLeg2);

payload.leg2_amount = store(leg2AmountDec.toString());
```

**这个值跟 legacy 的 `rate_transfer_to_amount`（旧的"Transfer From 侧"展示金额）不是同一个数**——旧字段只扣 `rateMul + Fee`，不管 Platform Fee（PHP 模型里 PT 是另外单独还给客户一笔）；Spring 这边的简化模型是"PT 直接冲抵 Fee"，所以 `leg2_amount` 要多减一个 PT。如果直接把 `rate_transfer_to_amount` 当成 `leg2_amount` 发过去，只要 `PlatformFee > 0`，提交就会被后端拒绝（"Leg2 amount must equal..."）。

---

## 4. `buildSpringSubmitRequest`（`transactionSubmitNormalize.js`）

### 4.1 曾经是完全断开的

改之前，这个函数的 RATE 分支读的是 `p.leg1_to_account_id` 等字段名，但 `buildRatePayload` 从来没生成过这些 key——**RATE 提交在 Spring 路径下必定在第一行就抛 `toAccountRequired`**。这不是这次改动引入的问题，是本来就断开的（`buildRatePayload` 只有 legacy PHP 命名，两个函数各写各的）。现在 `buildRatePayload` 真的生成了这些字段（见第 2 节），这条链路才算打通。

### 4.2 修了一个 Fee 取值的坑

```js
// 错误（改之前）：p.middleman_amount / p.rate_middleman_amount 存的是
// Middle-Man 总利润（Rate-Mul 佣金 + 净 Fee），不是 Fee 原始输入！
const middleFeeRaw = String(
  p.rate_middleman_fee ?? p.rate_middleman_input_amount ?? p.middleman_amount ?? p.rate_middleman_amount ?? "",
).trim();
```

如果只填了 Rate-Mul、没填 Fee，`rate_middleman_input_amount` 会是空字符串，链条会掉到 `p.rate_middleman_amount`（= 总利润，此时等于 Rate-Mul 佣金）——等于把 Rate-Mul 佣金误标成 Fee 传给后端。现在改成只认：

```js
const middleFeeRaw = String(p.middleman_fee_amount ?? p.rate_middleman_input_amount ?? "").trim();
```

`middleman_fee_amount` 是新字段（Fee 面值，第二币种），`rate_middleman_input_amount` 本来就是对的原始 Fee 值——两者语义一致，可以安全兜底；`middleman_amount` / `rate_middleman_amount`（总利润）**从兜底链里彻底移除**。

### 4.3 Rate-Mul：改传原始文本，不再传裸乘数

```js
// 改之前：body.middlemanRate = Number(middleRateRaw)  —— 除法模式的 "/1.55" 会被转成裸除数
//         或转成 NaN（如果 middleRateRaw 本身就是 "/1.55" 这种带斜杠字符串）
// 改之后：
if (hasMiddleRate) {
  body.middlemanRateExpression = middleRateRaw;   // 原样发送 "/1.55" 或 "2.93"
}
```

`hasMiddleRate` 的判定也从 `middleRateRaw !== "" && Number(middleRateRaw) > 0` 改成单纯 `middleRateRaw !== ""`——除法模式的字符串本来就不是合法 `Number`，数值有效性交给后端 `RateMulCalculator` 校验（校验失败时后端会明确报错，不需要前端重复判断）。

### 4.4 Platform Fee：以前完全没读，现在补上

```js
const platformFeeRaw = String(
  p.middleman_platform_fee_amount ?? p.rate_platform_fee_amount ?? p.rate_middleman_platform_fee ?? "",
).trim();
const hasMiddlePlatformFee = platformFeeRaw !== "" && Number(platformFeeRaw) > 0;
...
if (hasMiddlePlatformFee) {
  body.platformFeeAmount = parseSignedAmount(platformFeeRaw);
}
```

### 4.5 必填条件从「二选一」扩到「三选一」

```js
if ((hasMiddleRate || hasMiddleFee || hasMiddlePlatformFee) && !hasMiddleAccount) {
  throw new Error("middleManAccountRequired");
}
if (hasMiddleAccount && !hasMiddleRate && !hasMiddleFee && !hasMiddlePlatformFee) {
  throw new Error("middleManRateOrFeeRequired");
}
```

对齐后端 `resolveMiddleman()` 的三选一规则（见后端文档第 4 节）。

---

## 5. 完整字段映射表

| 前端 payload 字段（Spring 专用） | 后端 DTO 字段 | 备注 |
|---|---|---|
| `leg1_to_account_id` / `leg1_from_account_id` | `leg1ToAccountId` / `leg1FromAccountId` | |
| `leg1_currency` | `leg1CurrencyCode` | |
| `leg1_amount` | `leg1Amount` | |
| `leg2_to_account_id` / `leg2_from_account_id` | `leg2ToAccountId` / `leg2FromAccountId` | 只有第二组账户都选了才有（现恒有） |
| `leg2_currency` | `leg2CurrencyCode` | |
| `leg2_amount` | `leg2Amount` | 见第 3 节公式 |
| `rate_expression` | `rateExpression` | 以前没传，Rate-Mul 除法模式因此一直失效 |
| `exchange_rate` | `exchangeRate` | |
| `middleman_account_id` | `middlemanAccountId` | |
| `middleman_rate_expression` | `middlemanRateExpression` | 保留原始文本，不转裸数字 |
| `middleman_fee_amount` | `middlemanAmount` | 第二币种面值，不换汇 |
| `middleman_platform_fee_amount` | `platformFeeAmount` | 第二币种面值，恒正数 |

---

## 5.1 从 legacy PHP 前端 port 过来的两处修正（2026-09-05）

来源：`count168test`（legacy PHP 版 React 前端）9/2–9/4 期间对同一份算法文件的修改，随 `port(bank-process)`
之后的一次后续 merge 一起搬过来（legacy 那边逻辑跟后端无关，纯前端计算/文案，可以直接复用）。

1. **`computeRateMulCommission()` 的 "divide" 模式抽成方向反了**（`transactionSubmitHelpers.js:104-108`）：
   - 旧：`rateMulCommission = from/newDivisor − from/divisor`
   - 新：`rateMulCommission = from/divisor − from/newDivisor`（顾客固定金额 − 用 Rate-Mul 重新算出来的值）
   - 原因：除数越大，客人拿到的越少，Middle-Man 抽得越多，所以要 `newDivisor > divisor` 才应该是正的抽成——
     跟 multiply 模式方向相反（multiply 是"新汇率越小抽得越多"）。旧公式算出来的符号是反的。
2. **`buildRatePayload()` 里 leg2（Transfer）的 `transferFromDesc`/`transferToDesc` 引用错了账户**（同文件 `:256-264`）：
   - 旧：`transferFromDesc` 引用 `transferToCode`，`transferToDesc` 引用 `transferFromCode`（互相引用对方）
   - 新：`transferFromDesc` 引用自己的 `transferFromCode`，`transferToDesc` 引用自己的 `transferToCode`
   - 原因：payload 字段命名与 UI 是交叉的（`rate_transfer_from_account_id` 实际存的是 UI"To Account"），
     legacy 那边来回改了三次（先互相引用改成自身引用，又改回互相引用，最后定案在"自身引用"），这里直接采用
     legacy 最终收敛的版本。leg1 的 `fromDesc`/`toDesc`（互相引用）**没有改**，legacy 那边也没碰。

## 6. 已知限制 / 后续

1. **Mobile 未同步**：`c168_mobile/frontend/src/lib/transactionSubmitHelpers.js` 跟桌面共用算法文件的一份拷贝，但本次只改了桌面这份；如果 mobile 也要走 Spring RATE 提交，需要同样加一套 `leg1_*`/`leg2_*` 字段和对应的 `buildSpringSubmitRequest`（如果 mobile 有自己的适配层）。
2. **尚未在浏览器里做端到端实测**——只做了 `esbuild` 语法检查，没有实际提交过 RATE 表单验证金额是否真的对得上。
3. 表单里其余的即时计算、Reverse 行为、Description/Remark 规则等仍按 legacy PHP 参考文档（`transaction-rate-manual-logic.md` / `transaction-rate-service-platform-fee.md`）为准，这次没有改动。

---

## 7. 相关文件

- `src/pages/transaction/lib/transactionSubmitHelpers.js`（`buildRatePayload`）
- `src/pages/transaction/lib/transactionSubmitNormalize.js`（`buildSpringSubmitRequest`）
- `src/pages/transaction/hooks/useTransactionForm.js`（提交前校验、`onSubmitTx`）
- `src/translateFile/pages/transactionTranslate.js`（`pleaseSelectRateTransferAccounts`）
- 后端对应实现：[`Count/docs/transaction-rate-middleman-logic.md`](../../Count/docs/transaction-rate-middleman-logic.md)
