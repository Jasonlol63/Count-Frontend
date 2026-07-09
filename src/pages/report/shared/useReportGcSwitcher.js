import { useMemo } from "react";
import { dedupeCompanyRowsForSwitcher } from "../../processlist/processListHelpers.js";

/**
 * Process List 同款：去重公司行、集团 ID 列表、follow/all/ungrouped 下的公司按钮列表。
 */
export function useReportGcSwitcher(companies, companyId, groupFilterKind) {
  const allCompanyButtons = useMemo(
    () => dedupeCompanyRowsForSwitcher(companies, companyId),
    [companies, companyId],
  );

  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons.map((c) => String(c.group_id || "").trim().toUpperCase()).filter(Boolean))].sort(),
    [allCompanyButtons],
  );

  const selectedCompany = useMemo(
    () => allCompanyButtons.find((c) => Number(c.id) === Number(companyId)) || null,
    [allCompanyButtons, companyId],
  );

  const selectedGroupKey = useMemo(
    () => String(selectedCompany?.group_id || "").trim().toUpperCase(),
    [selectedCompany?.group_id],
  );

  const companyButtons = useMemo(() => {
    if (groupFilterKind === "all") {
      const groupOrder = new Map(groupIds.map((gid, idx) => [gid, idx]));
      return [...allCompanyButtons].sort((a, b) => {
        const ga = String(a.group_id || "").trim().toUpperCase();
        const gb = String(b.group_id || "").trim().toUpperCase();
        const ra = groupOrder.has(ga) ? groupOrder.get(ga) : Number.MAX_SAFE_INTEGER;
        const rb = groupOrder.has(gb) ? groupOrder.get(gb) : Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return String(a.company_id || "").localeCompare(String(b.company_id || ""), undefined, { numeric: true });
      });
    }
    if (groupFilterKind === "ungrouped") {
      return allCompanyButtons.filter((c) => !String(c.group_id || "").trim());
    }
    if (groupIds.length === 0) return allCompanyButtons;
    if (!selectedGroupKey) {
      const ung = allCompanyButtons.filter((c) => !String(c.group_id || "").trim());
      return ung.length ? ung : allCompanyButtons;
    }
    const inG = allCompanyButtons.filter((c) => String(c.group_id || "").trim().toUpperCase() === selectedGroupKey);
    return inG.length ? inG : allCompanyButtons;
  }, [allCompanyButtons, groupIds, selectedGroupKey, groupFilterKind]);

  return { allCompanyButtons, groupIds, selectedCompany, selectedGroupKey, companyButtons };
}
