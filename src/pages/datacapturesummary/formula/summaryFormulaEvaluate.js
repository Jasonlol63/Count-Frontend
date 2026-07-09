import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { removeThousandsSeparators } from "./summaryFormulaParseUtils.js";

export function evaluateMoneyExpression(expression) {
  let expr = removeThousandsSeparators(String(expression || "").trim())
    .replace(/\u2212/g, "-")
    .replace(/\s*\([A-Z]{2,4}\)\s*/g, " ")
    .replace(/\s*\(\s*\)\s*/g, " ")
    .replace(/\s+/g, "");

  if (expr === "") return MoneyDecimal.toDecimal("0");
  if (!/^[0-9+\-*/().]+$/.test(expr)) {
    expr = expr.replace(/[^0-9+\-*/().]/g, "");
  }
  if (expr === "") return MoneyDecimal.toDecimal("0");

  const openCount = (expr.match(/\(/g) || []).length;
  const closeCount = (expr.match(/\)/g) || []).length;
  if (openCount > closeCount) expr += ")".repeat(openCount - closeCount);

  const output = [];
  const ops = [];
  const precedence = { "u-": 3, "*": 2, "/": 2, "+": 1, "-": 1 };
  const rightAssoc = { "u-": true };
  let i = 0;
  let prev = "start";

  while (i < expr.length) {
    const ch = expr[i];
    if (/\d|\./.test(ch)) {
      let j = i + 1;
      while (j < expr.length && /[\d.]/.test(expr[j])) j += 1;
      output.push(MoneyDecimal.toDecimal(expr.slice(i, j)));
      i = j;
      prev = "number";
      continue;
    }
    if (ch === "(") {
      ops.push(ch);
      i += 1;
      prev = "operator";
      continue;
    }
    if (ch === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") output.push(ops.pop());
      if (ops.length && ops[ops.length - 1] === "(") ops.pop();
      i += 1;
      prev = "number";
      continue;
    }
    if ("+-*/".includes(ch)) {
      const op = ch === "-" && (prev === "start" || prev === "operator") ? "u-" : ch;
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        (precedence[ops[ops.length - 1]] > precedence[op] ||
          (precedence[ops[ops.length - 1]] === precedence[op] && !rightAssoc[op]))
      ) {
        output.push(ops.pop());
      }
      ops.push(op);
      i += 1;
      prev = "operator";
      continue;
    }
    throw new Error(`Invalid expression token: ${ch}`);
  }

  while (ops.length) {
    const op = ops.pop();
    if (op !== "(") output.push(op);
  }

  const stack = [];
  output.forEach((token) => {
    if (token instanceof MoneyDecimal.Decimal) {
      stack.push(token);
      return;
    }
    if (token === "u-") {
      stack.push(stack.pop().neg());
      return;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (!a || !b) throw new Error("Invalid money expression");
    if (token === "+") stack.push(a.plus(b));
    else if (token === "-") stack.push(a.minus(b));
    else if (token === "*") stack.push(a.times(b));
    else if (token === "/") stack.push(a.div(b));
  });

  return stack.length ? stack[0] : MoneyDecimal.toDecimal("0");
}

export function evaluateExpression(expression) {
  try {
    if (!expression || typeof expression !== "string") {
      console.warn("Invalid expression:", expression);
      return "0";
    }
    const result = evaluateMoneyExpression(expression);
    console.log("Expression result:", result.toString(), "from expression:", expression);
    return result.toString();
  } catch (error) {
    console.warn("Error evaluating expression:", error, "Expression:", expression);
    return "0";
  }
}
