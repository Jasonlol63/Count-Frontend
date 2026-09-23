import { getRoleClass } from "../../lib/transactionPaymentLogic.js";
import { formatTransactionGridMoneyHalfUp } from "../../lib/transactionFormat.js";

const ROLE_COLORS = {
  "transaction-role-capital": "border-l-blue-500",
  "transaction-role-bank": "border-l-sky-500",
  "transaction-role-cash": "border-l-emerald-500",
  "transaction-role-profit": "border-l-amber-500",
  "transaction-role-expenses": "border-l-violet-600",
  "transaction-role-company": "border-l-sky-600",
  "transaction-role-member": "border-l-teal-500",
  "transaction-role-agent": "border-l-cyan-500",
};

export default function AccountCard({ row, showName, m, onOpenHistory }) {
  const roleCls = getRoleClass(row?.role);
  const accent = ROLE_COLORS[roleCls] || "border-l-slate-300";
  const code = String(row?.account_id || "").toUpperCase();
  const name = showName ? String(row?.account_name || "").trim() : "";
  const currency = String(row?.currency || "").toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onOpenHistory?.(row)}
      className={`tap-scale w-full rounded-2xl border border-slate-100 border-l-4 bg-white p-3 text-left shadow-[0_8px_20px_-14px_rgba(15,23,42,0.25)] ${accent}`}
      aria-label={`${code} ${m.tapForHistory}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-slate-900">{code}</p>
          {name ? <p className="truncate text-[12px] text-slate-500">{name}</p> : null}
        </div>
        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold tracking-wide text-slate-600">
          {currency}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        <Metric label={m.bfTable} value={row?.bf} />
        <Metric label={m.winLossTableCompact} value={row?.win_loss} />
        <Metric label={m.crDrTable} value={row?.cr_dr} />
        <Metric label={m.balanceTableCompact} value={row?.balance} emphasize />
      </div>
    </button>
  );
}

function Metric({ label, value, emphasize = false }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-0.5 text-[11px] font-bold tabular-nums ${
          emphasize ? "text-[#0d60ff]" : "text-slate-700"
        }`}
      >
        {formatTransactionGridMoneyHalfUp(value)}
      </p>
    </div>
  );
}
