import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { isBankOnlyCategoryFlags } from "../../../utils/company/sidebarCompanySwitch.js";
import { isDashboardGroupOnlyMode } from "../../../utils/company/sharedCompanyFilter.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";

/**
 * Games maintenance pages (capture / transaction / formula): redirect when active company is bank-only.
 */
export function useMaintenanceBankOnlyGuard(companyId) {
  const navigate = useNavigate();
  const { me } = useAuthSession();

  useEffect(() => {
    if (isDashboardGroupOnlyMode()) return;
    if (companyId == null || Number(companyId) <= 0) return;
    const flags = {
      hasGambling: Boolean(me?.company_has_gambling),
      hasBank: Boolean(me?.company_has_bank),
    };
    if (!isBankOnlyCategoryFlags(flags)) return;
    navigate(spaPath("dashboard"), { replace: true });
  }, [companyId, me?.company_has_gambling, me?.company_has_bank, navigate]);
}
