import React, { useEffect, useMemo, useRef, useState } from "react";
import { accountModalOverlayZIndex, portalToDocumentBody } from "../../../components/ProcessModalPortal.jsx";
import ConfirmDeleteModal from "../../../components/ConfirmDeleteModal.jsx";
import { toUpper } from "../accountLogic.js";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";

const confirmModalZIndex = accountModalOverlayZIndex + 50;

export function AccountConfirmModal({
  open,
  message,
  onConfirm,
  onClose,
  t,
  title,
  confirmLabel,
  modalId = "confirmDeleteModal",
}) {
  return (
    <ConfirmDeleteModal
      open={open}
      modalId={modalId}
      zIndex={confirmModalZIndex}
      title={title || t("confirmDelete")}
      message={message || t("actionCannotUndone")}
      cancelLabel={t("cancel")}
      confirmLabel={confirmLabel || t("delete")}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

export function AccountAlertModal({ open, title, message, accountNames = [], onClose, t }) {
  if (!open) return null;
  return portalToDocumentBody(
    <div
      id="accountAlertModal"
      className="account-modal"
      role="dialog"
      aria-modal="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: confirmModalZIndex,
      }}
    >
      <div className="account-confirm-modal-content">
        <div className="account-confirm-icon-container">
          <svg className="account-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="account-confirm-title">{title}</h2>
        <p className="account-confirm-message">{message}</p>
        {accountNames.length > 0 ? (
          <ul className="account-currency-in-use-list">
            {accountNames.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : null}
        <div className="account-confirm-actions">
          <button type="button" className="btn btn-cancel confirm-cancel" onClick={onClose}>
            {t("ok")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LinkAccountModal({
  open,
  accounts,
  currentAccountId,
  selectedIds,
  setSelectedIds,
  linkType,
  setLinkType,
  searchTerm,
  setSearchTerm,
  onSave,
  onClose,
  t,
}) {
  const { submitting, runGuarded } = useSubmitGuard(open);

  const rows = useMemo(() => {
    const q = String(searchTerm || "").trim().toLowerCase();
    return (accounts || [])
      .filter((a) => Number(a.id) !== Number(currentAccountId))
      .filter((a) => {
        if (!q) return true;
        const text = `${a.account_id || ""} ${a.name || ""}`.toLowerCase();
        return text.includes(q);
      });
  }, [accounts, currentAccountId, searchTerm]);

  if (!open) return null;

  return portalToDocumentBody(
    <div id="linkAccountModal" className="account-modal" style={{ display: "block", zIndex: accountModalOverlayZIndex }}>
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>{t("linkAccountTitle")}</h2>
          <span className="account-close" onClick={onClose} role="button" tabIndex={0} aria-label={t("close")} />
        </div>
        <div className="link-account-fixed-area">
          <div className="link-account-toolbar-row">
            <div className="link-type-pills">
              <label className="link-type-pill">
                <input
                  type="radio"
                  name="linkType"
                  value="bidirectional"
                  checked={linkType === "bidirectional"}
                  onChange={() => setLinkType("bidirectional")}
                  className="link-type-radio"
                />
                <span className="link-type-pill-check">&#10003;</span>
                <span className="link-type-pill-text">{t("bidirectional")}</span>
              </label>
              <label className="link-type-pill">
                <input
                  type="radio"
                  name="linkType"
                  value="unidirectional"
                  checked={linkType === "unidirectional"}
                  onChange={() => setLinkType("unidirectional")}
                  className="link-type-radio"
                />
                <span className="link-type-pill-check">&#10003;</span>
                <span className="link-type-pill-text">{t("unidirectional")}</span>
              </label>
            </div>
            <div className="search-container userlist-search-bar link-account-toolbar-search">
              <span className="userlist-search-bar__icon" aria-hidden="true">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
              </span>
              <input
                type="text"
                className="search-input userlist-search-input"
                placeholder={t("searchAccount")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <p className="link-type-desc">
            {linkType === "bidirectional"
              ? t("bidirectionalDesc")
              : t("unidirectionalDesc")}
          </p>
        </div>
        <div className="account-modal-body link-account-modal-body">
          <div className="link-account-list">
            {rows.map((acc) => {
              const id = Number(acc.id);
              const checked = selectedIds.has(id);
              return (
                <label key={id} className={`link-account-item ${checked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    className="link-account-checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(id);
                        else next.delete(id);
                        return next;
                      })
                    }
                  />
                  <span>{toUpper(acc.account_id)}</span>
                </label>
              );
            })}
            {rows.length === 0 && (
              <div className="currency-toggle-note">{t("noAccountsToLink")}</div>
            )}
          </div>
        </div>
        <div className="account-form-actions link-account-form-actions">
          <button type="button" className="btn btn-add" disabled={submitting} onClick={() => runGuarded(onSave)}>
            {submitting ? t("saving") : t("save")}
          </button>
          <button type="button" className="btn btn-currency-setting" onClick={onClose}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

export function CurrencySettingModal({
  open,
  onClose,
  currencies,
  settingCurrencyId,
  setSettingCurrencyId,
  settingLinked,
  setSettingLinked,
  settingSearch,
  setSettingSearch,
  settingRole,
  setSettingRole,
  onLoadCurrencyLinks,
  onClearCurrencySelection,
  onSave,
  accounts,
  roles,
  currencyInput,
  setCurrencyInput,
  onCreateCurrency,
  t,
}) {
  const roleDropdownRef = useRef(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const { submitting, runGuarded } = useSubmitGuard(open);

  useEffect(() => {
    if (!open || !roleDropdownOpen) return undefined;
    const onPointerDown = (e) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target)) {
        setRoleDropdownOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setRoleDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, roleDropdownOpen]);

  if (!open) return null;

  const roleOptions = [{ value: "", label: t("filterRow") }, ...roles.map(r => ({ value: r, label: toUpper(r) }))];
  const roleLabel = settingRole ? toUpper(settingRole) : t("filterRow");
  const selectedCurrencyMatchesList =
    settingCurrencyId != null &&
    currencies.some((c) => Number(c.id) === Number(settingCurrencyId));
  const filteredAccounts = accounts.filter(a => {
    const text = `${a.account_id || ""} ${a.name || ""}`.toLowerCase();
    const matchesQ = !settingSearch || text.includes(settingSearch.toLowerCase());
    const matchesRole = !settingRole || String(a.role).toLowerCase().trim() === settingRole.toLowerCase().trim();
    return matchesQ && matchesRole;
  });

  return portalToDocumentBody(
    <div id="currencySettingModal" className="currency-fullscreen-modal" style={{ display: "block", zIndex: accountModalOverlayZIndex }}>
      <div className="currency-fullscreen-modal-content">
        <div className="currency-fullscreen-modal-header-bar">
          <h2>{t("currencySetting")}</h2>
          <button type="button" className="currency-btn-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            {t("back")}
          </button>
        </div>

        <div className="currency-fullscreen-modal-body">
          <div className="currency-left-panel">
            <div className="currency-setting-add-row-stacked">
              <label>{t("addCurrency")}</label>
              <div className="currency-setting-add-actions">
                <input
                  type="text"
                  className="currency-setting-input"
                  placeholder={t("pleaseEnterNewCurrency")}
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(toUpper(e.target.value))}
                />
                <button
                  type="button"
                  className="account-btn account-btn-add currency-setting-add-btn"
                  onClick={onCreateCurrency}
                >
                  {t("add")}
                </button>
              </div>
            </div>

            <div className="currency-setting-divider"></div>

            <div className="currency-setting-list-row-stacked">
              <label>{t("currency")}</label>
              <div className="currency-setting-pill-list">
                {currencies.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`currency-setting-pill ${settingCurrencyId === Number(c.id) ? "active" : ""}`}
                    aria-pressed={settingCurrencyId === Number(c.id)}
                    onClick={() => {
                      const id = Number(c.id);
                      if (settingCurrencyId === id) {
                        onClearCurrencySelection();
                      } else {
                        setSettingCurrencyId(id);
                        onLoadCurrencyLinks(id);
                      }
                    }}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="currency-right-panel">
            <div className="currency-setting-filter-row">
              <div className="currency-setting-filter-left">
                <h3>{t("account")}</h3>
                <div className="currency-setting-search-wrap">
                  <svg className="currency-setting-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    className="currency-setting-search-input"
                    placeholder={t("searchByAccountOrName")}
                    value={settingSearch}
                    onChange={(e) => setSettingSearch(toUpper(e.target.value))}
                  />
                </div>
                <div className={`currency-setting-role-filter${roleDropdownOpen ? " is-open" : ""}`} ref={roleDropdownRef}>
                  <button
                    type="button"
                    className="currency-setting-role-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={roleDropdownOpen}
                    onClick={() => setRoleDropdownOpen((openNow) => !openNow)}
                  >
                    <span>{roleLabel}</span>
                    <svg className="currency-setting-role-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 15l6-6 6 6" />
                    </svg>
                  </button>
                  {roleDropdownOpen ? (
                    <div className="currency-setting-role-menu" role="listbox">
                      {roleOptions.map((option) => {
                        const selected = String(settingRole || "") === String(option.value || "");
                        return (
                          <button
                            key={option.value || "all"}
                            type="button"
                            className={`currency-setting-role-option${selected ? " is-selected" : ""}`}
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setSettingRole(option.value);
                              setRoleDropdownOpen(false);
                            }}
                          >
                            <span>{option.label}</span>
                            {selected ? (
                              <svg className="currency-setting-role-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="currency-setting-selectall-row">
                <span className="currency-setting-selected-count">{t("selectedCount", { count: settingLinked.size })}</span>
                <button
                  type="button"
                  className="account-btn account-btn-add currency-setting-selectall-btn"
                  disabled={!selectedCurrencyMatchesList}
                  title={!selectedCurrencyMatchesList ? t("pleaseSelectCurrencyFirst") : undefined}
                  onClick={() => {
                    if (!selectedCurrencyMatchesList) return;
                    const allIds = filteredAccounts.map(a => Number(a.id));
                    const allSelected = allIds.every(id => settingLinked.has(id));
                    setSettingLinked(prev => {
                      const n = new Set(prev);
                      if (allSelected) {
                        allIds.forEach(id => n.delete(id));
                      } else {
                        allIds.forEach(id => n.add(id));
                      }
                      return n;
                    });
                  }}
                >
                  {t("selectAll")}
                </button>
              </div>
            </div>

            <div className="currency-setting-account-list account-grid account-grid--eight account-grid--process">
              {filteredAccounts.map(a => (
                <label key={a.id} className="account-item-compact account-item-compact--process currency-setting-select-card">
                  <input
                    type="checkbox"
                    checked={settingLinked.has(Number(a.id))}
                    onChange={(e) => {
                      const id = Number(a.id);
                      setSettingLinked(prev => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(id); else n.delete(id);
                        return n;
                      });
                    }}
                  />
                  <span className="account-label account-label--process">
                    {toUpper(a.account_id)}
                    {a.name ? <span className="account-label-desc">{a.name}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="currency-fullscreen-bottom-bar">
          <button
            type="button"
            className="account-btn account-btn-save currency-setting-submit-btn"
            disabled={!selectedCurrencyMatchesList || submitting}
            title={!selectedCurrencyMatchesList ? t("pleaseSelectCurrencyFirst") : undefined}
            onClick={() => runGuarded(onSave)}
          >
            {submitting ? t("saving") : t("save")}
          </button>
          <button type="button" className="account-btn account-btn-cancel currency-setting-cancel-btn" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
