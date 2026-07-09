import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import { formatCurrency } from "../lib/dashboardFormat.js";

export function DashboardAnimatedValue({ value, active = true, duration = 550, className = "" }) {
  const target = parseFloat(value) || 0;
  const animated = useAnimatedNumber(target, { duration, active });
  const tone = target > 0 ? "is-rising" : target < 0 ? "is-falling" : "";

  return (
    <span className={`dashboard-animated-value${tone ? ` ${tone}` : ""}${className ? ` ${className}` : ""}`}>
      {formatCurrency(animated)}
    </span>
  );
}
