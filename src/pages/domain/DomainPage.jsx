import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl } from "../../utils/core/apiUrl.js";
import {
  deleteOwner,
  fetchDomainFeeSettings,
  fetchDomainList,
  resolveShareLedgerTenantCode,
  resolveShareLedgerTenantId,
} from "./domainApi.js";
import "../../../public/css/domain.css";
import "../../../public/css/date-range-picker.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import { spaPath } from "../../utils/routing/pageRoutes.js";
import {
  ROWS_PER_PAGE,
  MAX_VISIBLE_CHIPS,
  hasProtectedCompany,
  forceSearchValue,
  normalizeDomainFeeSettingsFromApi,
  formatDomainFeeToolbarChip,
} from "./domainHelpers.js";

// Sub-components
import DomainNotification, { showDomainAlert } from "./components/DomainNotification.jsx";
import DomainConfirmModal from "./components/DomainConfirmModal.jsx";
import DomainFeeModal from "./components/DomainFeeModal.jsx";
import CompanyExpirationModal from "./components/CompanyExpirationModal.jsx";
import GroupExpirationModal from "./components/GroupExpirationModal.jsx";
import DomainFormModal from "./components/DomainFormModal.jsx";
import { getDomainText } from "../../translateFile/pages/domainTranslate.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { canAccessC168DomainPages } from "../../utils/company/loginScope.js";
import { fetchOwnerCompaniesAll, readPersistedDashboardGcFilter } from "../../utils/company/sharedCompanyFilter.js";

export default function DomainPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = (key, params) => getDomainText(lang, key, params);

  // ── Boot / domain data ───────────────────────────────────────────────────────
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  useLayoutEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page", "domain-page");
    return () => {
      document.body.classList.remove("domain-page");
    };
  }, []);


  // ── Domain list ────────────────────────────────────────────────────────────
  const [domains, setDomains] = useState([]);

  // ── Search / Pagination ────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // ── Checkboxes for delete ──────────────────────────────────────────────────
  const [checkedIds, setCheckedIds] = useState(new Set());

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [showDomainForm, setShowDomainForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingDomain, setEditingDomain] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  const [feeModal, setFeeModal] = useState(false);
  const [expModal, setExpModal] = useState(null);       // companies array
  const [groupExpModal, setGroupExpModal] = useState(null); // groups array

  // ── Domain fee price (for share calc + toolbar chips) ─────────────────────
  const [domainPeriodPrices, setDomainPeriodPrices] = useState(null);
  const feeChipCompany = useMemo(
    () => (domainPeriodPrices ? formatDomainFeeToolbarChip(domainPeriodPrices.company) : ""),
    [domainPeriodPrices]
  );
  const feeChipGroup = useMemo(
    () => (domainPeriodPrices ? formatDomainFeeToolbarChip(domainPeriodPrices.group) : ""),
    [domainPeriodPrices]
  );

  // ── Initial data load (session from AuthenticatedLayout) ─────────────────────
  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    (async () => {
      try {
        let allowed = canAccessC168DomainPages(me);
        if (!allowed) {
          const { companyId } = readPersistedDashboardGcFilter();
          if (companyId != null) {
            await fetchOwnerCompaniesAll({ me });
            allowed = canAccessC168DomainPages(me);
          }
        }
        if (!allowed) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }

        const rows = await fetchDomainList();
        if (!cancelled) {
          setDomains(rows);
          refreshFeeSummary();
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || t("failedToLoadDomainData"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  // ── Fee summary ────────────────────────────────────────────────────────────
  function refreshFeeSummary() {
    fetchDomainFeeSettings()
      .then((data) => {
        if (data) setDomainPeriodPrices(normalizeDomainFeeSettingsFromApi(data));
      })
      .catch(() => {});
  }

  // ── Filtered + paginated list ──────────────────────────────────────────────
  const filteredDomains = useMemo(() => {
    if (!searchTerm) return domains;
    const term = searchTerm.toLowerCase();
    return domains.filter((d) => {
      const comps = Array.isArray(d.companies_full) ? d.companies_full : [];
      const compStr = comps.map((c) => String(c.company_id || "").toLowerCase()).join(" ");
      return (
        String(d.owner_code || "").toLowerCase().includes(term) ||
        String(d.name || "").toLowerCase().includes(term) ||
        String(d.email || "").toLowerCase().includes(term) ||
        String(d.group_ids || "").toLowerCase().includes(term) ||
        compStr.includes(term)
      );
    });
  }, [domains, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDomains.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedDomains = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredDomains.slice(start, start + ROWS_PER_PAGE);
  }, [filteredDomains, safePage]);

  // Reset to page 1 on search change
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  // ── Delete logic ───────────────────────────────────────────────────────────
  function handleCheckbox(id, checked) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function handleDeleteSelected(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (checkedIds.size === 0) { showDomainAlert(t("selectOwnersToDeleteFirst"), "danger"); return; }

    const invalid = domains.filter((d) => checkedIds.has(d.id) && hasProtectedCompany(d.companies_full));
    const valid = domains.filter((d) => checkedIds.has(d.id) && !hasProtectedCompany(d.companies_full));

    if (invalid.length > 0 && valid.length === 0) {
      showDomainAlert(t("cannotDeleteC168Owners"), "danger"); return;
    }
    if (invalid.length > 0 && valid.length > 0) {
      showDomainAlert(
        t("c168OwnersCannotDeleteOthersWillDelete", { count: valid.length }),
        "danger"
      );
    }

    const names = valid.map((d) => d.name).join(", ");
    setConfirmModal({
      message: t("confirmDeleteOwners", { count: valid.length, names }),
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const results = await Promise.all(valid.map((d) => deleteOwner(d.id)));
          const ok = results.filter(({ json }) => json?.success).length;
          const fail = results.length - ok;
          if (fail === 0) showDomainAlert(t("deletedOwnersSuccess", { ok }));
          else {
            const firstErr = results.find(({ json }) => !json?.success)?.json?.message;
            showDomainAlert(firstErr || t("deletionCompleted", { ok, fail }), "danger");
          }
          const deletedIds = new Set(valid.map((d) => d.id));
          setDomains((prev) => prev.filter((d) => !deletedIds.has(d.id)));
          setCheckedIds(new Set());
        } catch {
          showDomainAlert(t("batchDeleteError"), "danger");
        }
      },
    });
  }

  // ── Open modals ────────────────────────────────────────────────────────────
  function openAddModal(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    setIsEditMode(false);
    setEditingDomain(null);
    setShowDomainForm(true);
  }

  function openEditModal(domain) {
    setIsEditMode(true);
    setEditingDomain(domain);
    setShowDomainForm(true);
  }

  async function handleDomainSaved() {
    try {
      const rows = await fetchDomainList();
      setDomains(rows);
    } catch {
      showDomainAlert(t("failedToLoadDomainData"), "danger");
    }
  }

  function handleCompanyBadgeClick(e, companiesFull) {
    e.stopPropagation();
    setExpModal(companiesFull);
  }

  function resolveGroupsFull(domain) {
    if (Array.isArray(domain?.groups_full) && domain.groups_full.length > 0) {
      return domain.groups_full;
    }
    const raw = String(domain?.group_ids || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .map((group_code) => ({ group_code, expiration_date: null }));
  }

  function handleGroupBadgeClick(e, groupsFull) {
    e.stopPropagation();
    setGroupExpModal(groupsFull);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const isOwnerOrAdmin = ["owner", "admin"].includes(String(me?.role || "").toLowerCase());

  return (
    <>
      <div className="container domain-react-page">
        {loadError && (
          <div style={{ marginBottom: 10, color: "#b91c1c", fontWeight: 600 }}>{loadError}</div>
        )}

        <div className="action-buttons">
          <div className="domain-toolbar-left">
            <button
              type="button"
              id="domainAddDomainBtn"
              className="btn-add"
              onClick={openAddModal}
              onPointerDown={(ev) => {
                ev.stopPropagation();
              }}
            >
              {t("addDomainBtn")}
            </button>
            <div className="search-container userlist-search-bar">
              <span className="userlist-search-bar__icon" aria-hidden="true">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
              </span>
              <input
                type="text"
                id="searchInput"
                placeholder={t("searchPlaceholder")}
                className="search-input userlist-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(forceSearchValue(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="btn-fee-settings"
              id="domainFeeSettingsBtn"
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={() => setFeeModal(true)}
            >
              {t("price")}
            </button>
            {domainPeriodPrices && (
              <div className="domain-fee-price-chips" aria-label={t("displayPrices")}>
                <button
                  type="button"
                  className="domain-fee-price-chip domain-fee-price-chip--company"
                  title={t("feeChipCompanyAria")}
                  onClick={() => setFeeModal(true)}
                >
                  C {feeChipCompany}
                </button>
                <button
                  type="button"
                  className="domain-fee-price-chip domain-fee-price-chip--group"
                  title={t("feeChipGroupAria")}
                  onClick={() => setFeeModal(true)}
                >
                  G {feeChipGroup}
                </button>
              </div>
            )}
          </div>
          <div className="domain-toolbar-right">
            <button
              type="button"
              className="btn-delete"
              id="deleteSelectedBtn"
              disabled={checkedIds.size === 0}
              onClick={handleDeleteSelected}
              onPointerDown={(ev) => {
                ev.stopPropagation();
              }}
            >
              {checkedIds.size > 0
                ? t("deleteWithCount", { count: checkedIds.size })
                : t("delete")}
            </button>
          </div>
        </div>

        <div className="table-container domain-list-table">
          <div className="domain-list-table-inner">
            <div className="table-header domain-list-table-header">
              <div>{t("no")}</div>
              <div>{t("ownerCodeWithColon")}</div>
              <div>{t("nameWithColon")}</div>
              <div>{t("emailWithColon")}</div>
              <div>{t("groupIdLabel")}:</div>
              <div>{t("companiesWithColon")}</div>
              <div>{t("createdBy")}</div>
              <div>{t("action")}</div>
            </div>
            <div className="domain-cards" id="domainTableBody">
            {pagedDomains.map((domain, idx) => {
              const globalIdx = (safePage - 1) * ROWS_PER_PAGE + idx + 1;
              const companiesFull = Array.isArray(domain.companies_full) ? domain.companies_full : [];
              const companyList = companiesFull.map((c) => c.company_id).filter(Boolean);
              const visible = companyList.slice(0, MAX_VISIBLE_CHIPS);
              const hidden = companyList.slice(MAX_VISIBLE_CHIPS);
              const groupsFull = resolveGroupsFull(domain);
              const groupList = groupsFull.map((g) => g.group_code).filter(Boolean);
              const visibleGroups = groupList.slice(0, MAX_VISIBLE_CHIPS);
              const hiddenGroups = groupList.slice(MAX_VISIBLE_CHIPS);
              const isProtected = hasProtectedCompany(companiesFull);

              return (
                <div key={domain.id} className="domain-card domain-list-row show-card" data-id={domain.id}>
                  <div className="card-item">{globalIdx}</div>
                  <div className="card-item uppercase-text">{domain.owner_code}</div>
                  <div className="card-item card-item--name">{domain.name}</div>
                  <div className="card-item card-item--email">{domain.email}</div>
                  <div
                    className="card-item groups-column"
                    data-groups={JSON.stringify(groupsFull)}
                  >
                    {groupList.length === 0 ? "-" : (
                      <div className="domain-chip-row">
                        {visibleGroups.map((gid) => {
                          const exp = groupsFull.find((g) => g.group_code === gid)?.expiration_date || "";
                          return (
                            <span
                              key={gid}
                              role="button"
                              tabIndex={0}
                              className="domain-company-chip company-badge domain-group-chip"
                              data-exp={exp || undefined}
                              onClick={(e) => handleGroupBadgeClick(e, groupsFull)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleGroupBadgeClick(e, groupsFull);
                                }
                              }}
                            >
                              {gid}
                            </span>
                          );
                        })}
                        {hiddenGroups.length > 0 && (
                          <button
                            type="button"
                            className="domain-company-more chip-more"
                            title={t("viewMoreGroupsHint")}
                            aria-label={t("viewMoreGroupsHint")}
                            onClick={(e) => handleGroupBadgeClick(e, groupsFull)}
                          >
                            +{hiddenGroups.length}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className="card-item companies-column"
                    data-companies={JSON.stringify(companiesFull)}
                  >
                    {companyList.length === 0 ? "-" : (
                      <div className="domain-chip-row">
                        {visible.map((cid) => {
                          const exp = companiesFull.find((c) => c.company_id === cid)?.expiration_date || "";
                          return (
                            <span
                              key={cid}
                              role="button"
                              tabIndex={0}
                              className="domain-company-chip company-badge"
                              data-exp={exp || undefined}
                              onClick={(e) => handleCompanyBadgeClick(e, companiesFull)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleCompanyBadgeClick(e, companiesFull);
                                }
                              }}
                            >
                              {cid}
                            </span>
                          );
                        })}
                        {hidden.length > 0 && (
                          <button
                            type="button"
                            className="domain-company-more chip-more"
                            title={t("viewMoreCompaniesHint")}
                            aria-label={t("viewMoreCompaniesHint")}
                            onClick={(e) => handleCompanyBadgeClick(e, companiesFull)}
                          >
                            +{hidden.length}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="card-item uppercase-text">
                    {String(domain.created_by || "-").toUpperCase()}
                  </div>
                  <div className="card-item domain-action-cell">
                    <button
                      type="button"
                      className="btn-edit domain-action-cell__edit"
                      onClick={() => openEditModal(domain)}
                      aria-label={t("edit")}
                    >
                      <img src={assetUrl("images/edit.svg")} alt={t("edit")} />
                    </button>
                    {!isProtected ? (
                      <input
                        type="checkbox"
                        className="domain-checkbox domain-action-cell__check"
                        value={domain.id}
                        checked={checkedIds.has(domain.id)}
                        aria-label={t("selectOwnerForDelete")}
                        onChange={(e) => handleCheckbox(domain.id, e.target.checked)}
                      />
                    ) : (
                      <span className="domain-action-cell__check domain-action-cell__check--empty" aria-hidden="true" />
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {filteredDomains.length > 0 && (
          <div className="pagination-container" id="paginationContainer">
            <button
              type="button"
              className="pagination-btn"
              id="prevBtn"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ◀
            </button>
            <span className="pagination-info" id="paginationInfo">
              {t("paginationOf", { page: safePage, total: totalPages })}
            </span>
            <button
              type="button"
              className="pagination-btn"
              id="nextBtn"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {showDomainForm && (
        <DomainFormModal
          key={isEditMode ? `e-${editingDomain?.id ?? ""}` : "add"}
          lang={lang}
          isEditMode={isEditMode}
          editingDomain={editingDomain}
          hasC168Context={canAccessC168DomainPages(me)}
          isOwnerOrAdmin={isOwnerOrAdmin}
          shareLedgerTenantId={resolveShareLedgerTenantId(me)}
          shareLedgerTenantCode={resolveShareLedgerTenantCode(me)}
          domainPeriodPrices={domainPeriodPrices}
          allDomains={domains}
          onClose={() => setShowDomainForm(false)}
          onSaved={handleDomainSaved}
        />
      )}

      {confirmModal && (
        <DomainConfirmModal
          lang={lang}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {feeModal && (
        <DomainFeeModal
          lang={lang}
          onClose={() => setFeeModal(false)}
          onFeeSaved={(data) => {
            setDomainPeriodPrices(normalizeDomainFeeSettingsFromApi(data));
          }}
        />
      )}

      {expModal && (
        <CompanyExpirationModal
          lang={lang}
          companies={expModal}
          onClose={() => setExpModal(null)}
        />
      )}

      {groupExpModal && (
        <GroupExpirationModal
          lang={lang}
          groups={groupExpModal}
          onClose={() => setGroupExpModal(null)}
        />
      )}

      <DomainNotification />
    </>
  );
}
