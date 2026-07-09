/** Ownership page — shared helpers (parity with ownership.js / ownership-group.js) */

import { companyRowIsGroupEntityAnyShape } from "../../../utils/company/sharedCompanyFilter.js";

export function isApiSuccess(res) {
  return res && (res.success === true || res.status === "success");
}

export function isApiConflict(res) {
  return res && res.status === "conflict";
}

export function getApiMessage(res, fallback = "Server error") {
  if (!res) return fallback;
  if (typeof res.message === "string" && res.message.trim() !== "") return res.message;
  if (typeof res.error === "string" && res.error.trim() !== "") return res.error;
  return fallback;
}

export function getApiData(res, fallback = []) {
  if (!res) return fallback;
  if (res.data !== undefined) return res.data;
  return fallback;
}

export function rebuildGroupIds(allCompanies) {
  return [
    ...new Set(
      (allCompanies || [])
        .map((c) => c.group_id)
        .filter((g) => g && String(g).trim() !== "")
    ),
  ].sort();
}

/** Subsidiary companies under a group — excludes AP/IG group-entity rows. */
export function ownershipSubsidiariesInGroup(allCompanies, groupId) {
  if (!groupId) return [];
  const g = String(groupId).trim().toLowerCase();
  return (allCompanies || []).filter((c) => {
    const gid = c.group_id ? String(c.group_id).trim().toLowerCase() : "";
    if (gid !== g) return false;
    return !companyRowIsGroupEntityAnyShape(c);
  });
}

export function countOwnershipSubsidiariesInGroup(allCompanies, groupId) {
  return ownershipSubsidiariesInGroup(allCompanies, groupId).length;
}
