import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { sessionHasTenantBank, sessionHasTenantGame } from "../../../utils/auth/sessionTenant.js";
import { isBankOnlyCategoryFlags } from "../../../utils/company/sidebarCompanySwitch.js";
import { isDashboardGroupOnlyMode } from "../../../utils/company/sharedCompanyFilter.js";
import { spaPath } from "../../../utils/routing/pageRoutes.js";

/**
 * Formula maintenance: redirect when active company is bank-only.
 */
export function useMaintenanceBankOnlyGuard(companyId) {
  const navigate = useNavigate();
  const { me } = useAuthSession();

  useEffect(() => {
    if (isDashboardGroupOnlyMode()) return;
    if (companyId == null || Number(companyId) <= 0) return;
    const flags = {
      hasGambling: sessionHasTenantGame(me),
      hasBank: sessionHasTenantBank(me),
    };
    if (!isBankOnlyCategoryFlags(flags)) return;
    navigate(spaPath("dashboard"), { replace: true });
  }, [companyId, me, navigate]);
}
