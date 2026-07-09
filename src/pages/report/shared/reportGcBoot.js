import { canUseGroupOnlyMode, isCompanyLogin } from "../../../utils/company/loginScope.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";
import {
  independentCompaniesForPicker,
  isDashboardGroupOnlyMode,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyWhenClosingGroup,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";

/** Report pages never boot into group-only when logged in as a company. */
export function resolveReportGroupOnlyBoot(me, bootGc, persistedGc, bootGroup) {
  if (isCompanyLogin(me)) return false;
  return Boolean(
    bootGc.groupOnly ||
      persistedGc.groupOnly ||
      (bootGroup && isDashboardGroupOnlyMode() && canUseGroupOnlyMode(me, bootGroup)),
  );
}

/** Company-login report boot: when a group is set, always resolve a subsidiary company. */
export function resolveReportBootCompanyForGroup(me, companies, bootGroup, preferredCompanyId = null) {
  if (!isCompanyLogin(me) || !bootGroup) return null;
  const pick =
    pickDefaultSubsidiaryForGroup(companies, bootGroup, {
      me,
      preferredCompanyId,
    }) ??
    pickDefaultCompanyForGroup(companies, bootGroup, {
      me,
      preferredCompanyId,
    });
  return pick?.id ?? null;
}

function rowHasReportGambling(row) {
  const id = Number(row?.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  const flags = peekCompanySessionFlags(id);
  return flags ? Boolean(flags.has_gambling) : true;
}

/**
 * Report: closing group → independent companies only (e.g. ABC).
 * Grouped subsidiaries such as C168 must not remain active.
 */
export function resolveReportCompanyWhenClosingGroup(_me, companies, currentCompanyId, groupIds = null) {
  const list = companies ?? [];
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(list);
  const independents = independentCompaniesForPicker(list, gids);
  const reportable =
    independents.find((row) => rowHasReportGambling(row)) ?? independents[0] ?? null;
  if (reportable) return reportable;
  return resolveCompanyWhenClosingGroup(list, currentCompanyId, gids);
}
