function parseMoneyNumber(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function MemberAmountArrow({ up }) {
  if (up) {
    return (
      <svg className="member-amount-pill__icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M5 1.5 8.5 6H1.5L5 1.5z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="member-amount-pill__icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 8.5 1.5 4h7L5 8.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * 金额单元格：正数盈利（绿）、负数亏损（红）、零为中性色。
 * - pill：胶囊徽章（明细表少用）
 */
export default function MemberMoneyCell({ value, formatMoney, pill = false }) {
  const n = parseMoneyNumber(value);
  const display = formatMoney(value);

  if (n === null) {
    return <span className="member-amount member-amount--empty">–</span>;
  }
  if (n === 0) {
    return <span className="member-amount member-amount--zero">-</span>;
  }

  const tone = n > 0 ? "pos" : "neg";

  if (pill && n !== 0) {
    return (
      <span className={`member-amount-pill member-amount-pill--${tone}`}>
        <MemberAmountArrow up={n > 0} />
        <span className="member-amount-pill__text">{display}</span>
      </span>
    );
  }

  return <span className={`member-amount member-amount--${tone}`}>{display}</span>;
}
