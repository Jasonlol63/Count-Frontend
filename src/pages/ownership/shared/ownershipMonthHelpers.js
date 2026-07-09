export function getOwnershipCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isOwnershipHistoricalMonth(monthKey) {
  return monthKey < getOwnershipCurrentMonthKey();
}

export function getOwnershipMonthLabels(lang = "en") {
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return Array.from({ length: 12 }, (_, i) =>
    new Date(2020, i, 1).toLocaleDateString(locale, { month: "short" }),
  );
}

export function formatOwnershipMonthShort(monthKey, lang = "en") {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "";
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return d.toLocaleDateString(locale, { year: "numeric", month: "short" });
}

export function formatOwnershipMonthLabel(monthKey, lang = "en") {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "";
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return d.toLocaleDateString(locale, { year: "numeric", month: "long" });
}

export function formatOwnershipSavedAt(iso, lang = "en") {
  if (!iso) return "";
  const d = new Date(String(iso).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(iso);
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
