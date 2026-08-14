import React from "react";
import { assetUrl } from "../../../utils/core/apiUrl.js";
import {
  computeRowCapabilities,
  formatUserLastLoginDate,
  formatUserLastLoginTimeTitle,
  getDeleteCheckboxState,
  normRole,
} from "../userListLogic.js";
import { formatUserRoleDisplay, formatUserStatusDisplay } from "../../../translateFile/pages/userListTranslate.js";

function roleBadgeClass(role) {
  return `role-${String(role || "").toLowerCase().replace(/\s+/g, "-")}`;
}

/**
 * User table body. memo + parent freezes props while Add/Edit modal is open
 * so role/permission edits do not rebuild every row.
 */
function UserCardsList({
  pageRows,
  effectivePage,
  pageSize,
  showAll,
  usePagedFill,
  showBulkDeleteColumn,
  selectedDeleteIds,
  setSelectedDeleteIds,
  currentUserId,
  currentUserRole,
  userMutationsBlocked,
  isUserEditBlockedByReadOnly,
  onEdit,
  onToggleStatus,
  t,
}) {
  return (
    <div
      className={`user-cards${usePagedFill ? " user-cards--paged-fill" : ""}`}
      style={usePagedFill ? { "--user-list-page-size": pageSize } : undefined}
    >
      {pageRows.map((r, idx) => {
        const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
        const del = getDeleteCheckboxState(r, caps);
        const editReady = caps.canEditDelete;
        return (
          <div
            key={`${r.id}-${r.is_owner_shadow ? "o" : "u"}`}
            className={`user-card user-list-row show-card ${idx % 2 === 0 ? "row-even" : "row-odd"}`}
          >
            <div className="card-item">{showAll ? idx + 1 : (effectivePage - 1) * pageSize + idx + 1}</div>
            <div className="card-item">{r.login_id}</div>
            <div className="card-item">{r.name}</div>
            <div className="card-item">{r.email || "-"}</div>
            <div className="card-item">
              <span className={`role-badge ${roleBadgeClass(r.role)}`}>
                {String(formatUserRoleDisplay(t, r.role)).toUpperCase()}
              </span>
            </div>
            <div className="card-item">
              <span
                className={`role-badge ${normRole(r.status) === "active" ? "status-active" : "status-inactive"} ${caps.canToggleStatus && !userMutationsBlocked ? "status-clickable" : ""}`}
                onClick={() => !userMutationsBlocked && caps.canToggleStatus && onToggleStatus(r)}
                title={
                  userMutationsBlocked
                    ? t("readOnlyActionBlocked")
                    : caps.canToggleStatus
                      ? t("clickToggleStatus")
                      : undefined
                }
              >
                {formatUserStatusDisplay(t, r.status)}
              </span>
            </div>
            <div className="card-item" title={formatUserLastLoginTimeTitle(r.last_login) || undefined}>
              {formatUserLastLoginDate(r.last_login)}
            </div>
            <div className="card-item">{String(r.created_by || "-").toUpperCase()}</div>
            <div className="card-item card-item--action">
              <div className="user-action-tools">
                <div className="user-action-tools-bar">
                  <button
                    type="button"
                    className="btn btn-edit user-edit-btn"
                    onClick={() => onEdit(r)}
                    disabled={!editReady || isUserEditBlockedByReadOnly(r)}
                    aria-label={t("edit")}
                    title={t("edit")}
                  >
                    <img src={assetUrl("images/edit.svg")} alt={t("edit")} />
                  </button>
                </div>
              </div>
            </div>
            {showBulkDeleteColumn && (
              <div className="card-item card-item--select">
                {del.show ? (
                  <input
                    type="checkbox"
                    aria-label={t("rowDeleteCheckboxAria")}
                    disabled={del.disabled || userMutationsBlocked}
                    checked={selectedDeleteIds.has(Number(r.id))}
                    onChange={(e) =>
                      setSelectedDeleteIds((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(Number(r.id));
                        else n.delete(Number(r.id));
                        return n;
                      })
                    }
                  />
                ) : (
                  <span className="user-row-select-placeholder" aria-hidden="true" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(UserCardsList);
