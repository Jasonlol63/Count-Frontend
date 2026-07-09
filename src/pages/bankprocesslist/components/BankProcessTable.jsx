import React from "react";
import { assetUrl, buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  canShowBankResend,
  normalizeBankProcessStatus,
  formatBankProcessContractLabel,
  bankProcessContractBadgeKey,
  formatBankMoneyFixed2,
  formatBankWithTypeDisplay,
  isValidBankMoneyInput,
} from "../lib/bankProcessHelpers.js";
import BankProcessStatusControl from "./BankProcessStatusControl.jsx";

function formatBankMoneyCell(value) {
  const raw = value != null ? String(value).trim() : "";
  if (!raw) return "-";
  if (!isValidBankMoneyInput(raw)) return raw;
  return formatBankMoneyFixed2(raw);
}

function BankSortIcon({ column, sortColumn, sortDirection }) {
  return (
    <span
      className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`}
      aria-hidden="true"
    >
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );
}

function getContractStateClass(dayStart, dayEnd) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const hasDayStart = dayStart != null && String(dayStart).trim() !== "";
  if (!hasDayStart) return "contract-pending";
  const start = String(dayStart).substring(0, 10);
  const end = dayEnd ? String(dayEnd).substring(0, 10) : null;
  if (todayStr < start) return "contract-pending";
  if (end && todayStr > end) return "contract-expired";
  if (start && end && todayStr >= start && todayStr <= end) return "contract-active";
  if (start && todayStr >= start) return "contract-active";
  return "contract-expired";
}

function renderBankContract(value, dayStart, dayEnd, lang) {
  const text = String(value || "").trim();
  if (!text) return "-";

  const contractBadgeKey = bankProcessContractBadgeKey(text);
  const displayLabel = formatBankProcessContractLabel(lang, text);

  const baseContractClass = getContractStateClass(dayStart || null, dayEnd || null);
  const grayContracts = ["1 MONTH", "1+1 MONTH", "1+2 MONTHS", "1+3 MONTHS"];
  const contractClass =
    grayContracts.indexOf(contractBadgeKey) !== -1 && baseContractClass === "contract-active"
      ? "contract-1month-active"
      : baseContractClass;

  return (
    <span className={`contract-badge ${contractClass} bank-contract-pill`}>
      {displayLabel}
    </span>
  );
}

export default function BankProcessTable({
  tableLoading,
  showAll,
  showSelectColumn,
  pageRows,
  currentPage,
  PAGE_SIZE,
  selectedIds,
  setSelectedIds,
  notify,
  onBankStatusUpdated,
  openEdit,
  openRemarkModal,
  openResendModal,
  isBankResendScheduleLockedToday,
  sortColumn,
  sortDirection,
  onSort,
  showHeaderSelectAll,
  lang,
  t,
}) {
  const deletableRows = pageRows.filter(
    (r) => normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions
  );
  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((r) => selectedIds.has(r.id));
  const toggleHeaderSelectAll = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) deletableRows.forEach((r) => next.add(r.id));
      else deletableRows.forEach((r) => next.delete(r.id));
      return next;
    });
  };

  const bankColClass = (key) => `bank-col bank-col-${key}`;

  /** <1700px：Bank 最多两行；Card Owner 单行省略 + title 悬停 */
  const bankNameWrapKeys = new Set(["bank"]);
  /** <1600px：金额/日期/短码强制单行 */
  const bankSingleLineKeys = new Set([
    "no",
    "ccy",
    "contract",
    "insurance",
    "customer",
    "cost",
    "price",
    "profit",
    "date",
  ]);

  const cellClass = (key, extra = "") =>
    `card-item bank-virtual-cell ${bankColClass(key)}${
      bankNameWrapKeys.has(key) ? " bank-virtual-cell--wrap" : ""
    }${bankSingleLineKeys.has(key) ? " bank-virtual-cell--single-line" : ""}${extra ? ` ${extra}` : ""}`;

  const renderBankCell = (bank, type) => {
    const b = String(bank ?? "").trim();
    const t = String(type ?? "").trim();
    const display = formatBankWithTypeDisplay(bank, type);
    if (display === "-") return "-";
    if (!t) return display;
    return (
      <span className="bank-cell-display bank-cell-display--typed" title={display}>
        <span className="bank-cell-display__name">{b}</span>
        <span className="bank-cell-display__type">({t})</span>
      </span>
    );
  };

  const bankHeaderDefs = [
    { key: "no", labelText: t("no"), sortable: false },
    { key: "supplier", labelText: t("supplier"), sortable: true },
    { key: "ccy", labelText: t("country"), sortable: true },
    { key: "bank", labelText: t("bank"), sortable: true },
    { key: "owner", labelText: t("cardOwner"), sortable: true },
    { key: "contract", labelText: t("contract"), sortable: true },
    { key: "insurance", labelText: t("insurance"), sortable: true },
    { key: "customer", labelText: t("customer"), sortable: true },
    { key: "cost", labelText: t("cost"), sortable: true },
    { key: "price", labelText: t("price"), sortable: true },
    { key: "profit", labelText: t("profit"), sortable: true },
    { key: "status", labelText: t("status"), sortable: true },
    { key: "date", labelText: t("date"), sortable: true },
    { key: "action", labelText: t("action"), sortable: false },
  ];

  const bankHeaders = [...bankHeaderDefs];
  if (showSelectColumn) {
    bankHeaders.push({
      key: "bulk",
      isSelect: true,
      label:
        showHeaderSelectAll && deletableRows.length > 0 ? (
          <input
            type="checkbox"
            className="header-action-checkbox"
            title={t("selectAll")}
            aria-label={t("selectAllDeletableOnPage")}
            checked={allDeletableSelected}
            onChange={(e) => toggleHeaderSelectAll(e.target.checked)}
          />
        ) : null,
    });
  }

  const renderSortableHeader = (h) => {
    const isActive = sortColumn === h.key;
    const ariaSort = !isActive ? "none" : sortDirection === "asc" ? "ascending" : "descending";
    const sortHint = isActive
      ? sortDirection === "asc"
        ? " (↑)"
        : " (↓)"
      : " (↕)";

    return (
      <div
        key={h.key}
        className={`header-item bank-header bank-virtual-th header-item--with-sort-icon header-sortable ${bankColClass(h.key)}`}
        role="columnheader"
        aria-sort={ariaSort}
        title={`${h.labelText}${sortHint}`}
        onClick={() => onSort(h.key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSort(h.key);
          }
        }}
      >
        <span className="header-item__label bank-virtual-th__label">{h.labelText}</span>
        <BankSortIcon column={h.key} sortColumn={sortColumn} sortDirection={sortDirection} />
      </div>
    );
  };

  const tableShellClass = `bank-virtual-table${showSelectColumn ? " bank-virtual-table--select-col" : ""}`;
  /** Last N visible rows: status menu opens upward to avoid pagination/footer overlap. */
  const STATUS_MENU_UP_LAST_ROWS = 3;

  return (
    <div
      className={`process-table-wrapper bank-process-table-region${
        showSelectColumn ? " process-table-wrapper--select-col" : ""
      }`}
    >
      <div className={tableShellClass}>
        <div className="bank-virtual-table-inner">
          <div className="bank-virtual-thead">
            <div className="table-header bank-virtual-head-row" role="row">
              {bankHeaders.map((h) => {
                if (h.isSelect) {
                  return (
                    <div
                      key={h.key}
                      role="columnheader"
                      className={`header-item bank-header bank-virtual-th bank-virtual-th-checkbox header-item--select ${bankColClass("bulk")}`}
                    >
                      {h.label}
                    </div>
                  );
                }
                if (h.sortable) {
                  return renderSortableHeader(h);
                }
                return (
                  <div
                    key={h.key}
                    role="columnheader"
                    className={`header-item bank-header bank-virtual-th ${bankColClass(h.key)}${
                      h.key === "action" ? " bank-action-header" : ""
                    }`}
                  >
                    <span className="header-item__label bank-virtual-th__label">{h.labelText}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bank-virtual-scroll-clip">
            <div className="bank-virtual-scroll-shell">
            <div className="process-cards bank-mode bank-virtual-scroll">
            {tableLoading && pageRows.length === 0 && (
              <div className="process-card bank-virtual-data-row bank-virtual-data-row--message">
                <div className="card-item bank-virtual-cell bank-virtual-cell--message">{t("loadData")}</div>
              </div>
            )}
            {!tableLoading && pageRows.length === 0 && (
              <div className="process-card bank-virtual-data-row bank-virtual-data-row--message">
                <div className="card-item bank-virtual-cell bank-virtual-cell--message">{t("noProcessDataFound")}</div>
              </div>
            )}
            {pageRows.length > 0 &&
              pageRows.map((r, i) => (
                <div key={r.id} className="process-card bank-virtual-data-row">
                  <div className={cellClass("no")}>{(showAll ? i : (currentPage - 1) * PAGE_SIZE + i) + 1}</div>
                  <div className={cellClass("supplier")}>{r.card_lower || "-"}</div>
                  <div className={cellClass("ccy")}>{r.country || "-"}</div>
                  <div className={cellClass("bank")}>{renderBankCell(r.bank, r.type)}</div>
                  <div
                    className={cellClass("owner")}
                    title={String(r.supplier || "").trim() || undefined}
                  >
                    <span className="bank-owner-text">{r.supplier || "-"}</span>
                  </div>
                  <div className={cellClass("contract", "bank-contract-cell")}>
                    {renderBankContract(r.contract, r.day_start || r.date, r.day_end, lang)}
                  </div>
                  <div className={cellClass("insurance")}>{r.insurance || "-"}</div>
                  <div className={cellClass("customer")}>{r.customer || "-"}</div>
                  <div className={cellClass("cost")}>{formatBankMoneyCell(r.cost)}</div>
                  <div className={cellClass("price")}>{formatBankMoneyCell(r.price)}</div>
                  <div className={cellClass("profit")}>{formatBankMoneyCell(r.profit)}</div>
                  <div className={cellClass("status", "bank-status-cell")}>
                    <BankProcessStatusControl
                      row={r}
                      openMenuUp={pageRows.length > 0 && i >= pageRows.length - STATUS_MENU_UP_LAST_ROWS}
                      lang={lang}
                      notify={notify}
                      buildApiUrl={buildApiUrl}
                      t={t}
                      onUpdated={(target, opts) => onBankStatusUpdated?.(r, target, opts)}
                    />
                  </div>
                  <div className={cellClass("date")}>{r.date || "-"}</div>
                  {showSelectColumn ? (
                    <>
                      <div className={cellClass("action", "bank-action-cell card-item--action")}>
                        <span className="bank-action-tools">
                          <button type="button" className="edit-btn" aria-label={t("edit")} title={t("edit")} onClick={() => openEdit(r.id)}>
                            <img src={assetUrl("images/edit.svg")} alt={t("edit")} />
                          </button>
                          <button
                            type="button"
                            className="edit-btn remark-action-btn"
                            aria-label={t("remark")}
                            title={t("remark")}
                            onClick={() => openRemarkModal(r)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path
                                d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {canShowBankResend(r) ? (
                            <button
                              type="button"
                              className="bank-resend-btn"
                              aria-label={t("resendToAccountingDue")}
                              title={
                                typeof isBankResendScheduleLockedToday === "function" &&
                                isBankResendScheduleLockedToday(r, r.day_start || r.date)
                                  ? t("resendLockedPostedToday")
                                  : t("resend")
                              }
                              disabled={
                                typeof isBankResendScheduleLockedToday === "function" &&
                                isBankResendScheduleLockedToday(r, r.day_start || r.date)
                              }
                              onClick={() => openResendModal(r)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path
                                  d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M3 3v5h5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          ) : null}
                        </span>
                      </div>
                      <div className="card-item bank-virtual-cell card-item--select bank-row-select-cell">
                        {normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions ? (
                          <input
                            type="checkbox"
                            className="row-checkbox bank-checkbox"
                            checked={selectedIds.has(r.id)}
                            title={t("selectForDeletion")}
                            aria-label={t("selectForDeletion")}
                            onChange={() =>
                              setSelectedIds((prev) => {
                                const n = new Set(prev);
                                if (n.has(r.id)) n.delete(r.id);
                                else n.add(r.id);
                                return n;
                              })
                            }
                          />
                        ) : (
                          <span className="user-row-select-placeholder" aria-hidden="true" />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className={cellClass("action")}>
                      <span className="bank-action-tools">
                        <button type="button" className="edit-btn" aria-label={t("edit")} title={t("edit")} onClick={() => openEdit(r.id)}>
                          <img src={assetUrl("images/edit.svg")} alt={t("edit")} />
                        </button>
                        <button
                          type="button"
                          className="edit-btn remark-action-btn"
                          aria-label={t("remark")}
                          title={t("remark")}
                          onClick={() => openRemarkModal(r)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        {canShowBankResend(r) ? (
                          <button
                            type="button"
                            className="bank-resend-btn"
                            aria-label={t("resendToAccountingDue")}
                            title={t("resend")}
                            onClick={() => openResendModal(r)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path
                                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M3 3v5h5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        ) : null}
                      </span>
                      {normalizeBankProcessStatus(r.status) === "inactive" && !r.has_transactions ? (
                        <input
                          type="checkbox"
                          className="row-checkbox bank-checkbox"
                          style={{ marginLeft: 10 }}
                          checked={selectedIds.has(r.id)}
                          title={t("selectForDeletion")}
                          onChange={() =>
                            setSelectedIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(r.id)) n.delete(r.id);
                              else n.add(r.id);
                              return n;
                            })
                          }
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
