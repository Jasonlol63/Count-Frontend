import { useEffect, useMemo, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import { AUTO_RENEW_PERIODS } from "../../lib/autoRenewApi.js";
import {
  canApproveRow,
  canDeleteRow,
  formatAutoRenewAccountLabel,
  formatRemainingForRow,
  getAutoRenewApproveDisabledReason,
  getRowDraftValues,
  periodToLabelKey,
  resolveAutoRenewDisplayPrice,
  tenantCode,
} from "../../lib/autoRenewHelpers.js";
import { formatDomainFeeDisplay2 } from "../../lib/domainHelpers.js";
import "../transaction/add-transaction-sheet.css";
import "../account/account.css";

function Sheet({ open, title, onClose, tall = false, elevate = false, children, footer = null }) {
  useOverlayLock(open, onClose);
  return (
    <div
      className={`m-sheet-overlay${elevate ? " m-sheet-overlay--high" : ""}${
        open ? " m-sheet-overlay--open" : " m-sheet-overlay--closed"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <button type="button" className="m-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`m-sheet-panel${tall ? " m-sheet-panel--tall" : ""}${
          open ? " m-sheet-panel--open" : " m-sheet-panel--closed"
        }`}
      >
        <div className="m-sheet-handle-wrap" aria-hidden="true">
          <span className="m-sheet-handle" />
        </div>
        <header className="m-sheet-header">
          <h2 className="m-sheet-title">{title}</h2>
          <button type="button" className="m-sheet-close tap-scale" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="m-sheet-body m-account-sheet-body">{children}</div>
        {footer ? <footer className="m-account-sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

function statusLabel(status, t) {
  if (status === "approved") return t("statusApproved");
  if (status === "rejected") return t("statusRejected");
  return t("statusPending");
}

export function AutoRenewDetailSheet({
  open,
  onClose,
  row,
  accounts,
  feeSettings,
  canEdit,
  busy,
  t,
  onApprove,
  onReject,
  onDelete,
}) {
  const [draft, setDraft] = useState({ period: "", fromAccountId: "", toAccountId: "" });
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!open || !row) return;
    const values = getRowDraftValues(row, {});
    setDraft(values);
    setConfirm(null);
  }, [open, row]);

  const pendingEditable = Boolean(row && row.status === "pending" && !row.is_payment_deleted && canEdit);
  const price = row ? resolveAutoRenewDisplayPrice(row, draft, feeSettings) : 0;
  const approveOk = row ? canApproveRow(row, draft, feeSettings) : false;
  const approveHint = row ? getAutoRenewApproveDisabledReason(row, draft, feeSettings, t) : "";
  const deleteOk = row ? canDeleteRow(row) : false;
  const company = row ? tenantCode(row) : "";

  const accountOptions = useMemo(
    () => (Array.isArray(accounts) ? accounts : []).map((acc) => ({
      id: String(acc.id ?? acc.account_id ?? ""),
      label: formatAutoRenewAccountLabel(acc),
    })).filter((a) => a.id),
    [accounts],
  );

  if (!row) {
    return (
      <Sheet open={open} title={t("pageTitle")} onClose={onClose}>
        <p className="m-ar-muted">—</p>
      </Sheet>
    );
  }

  const periodLabelKey = periodToLabelKey(row.period || draft.period);
  const showConfirm = Boolean(confirm);

  return (
    <>
      <Sheet
        open={open && !showConfirm}
        title={t("detailTitle", { company })}
        onClose={onClose}
        tall
        footer={
          pendingEditable ? (
            <div className="m-account-footer-actions">
              <button
                type="button"
                className="m-account-danger-btn tap-scale"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: t("confirmRejectTitle"),
                    message: t("confirmReject", { company }),
                    tone: "danger",
                    action: "reject",
                  })
                }
              >
                {t("reject")}
              </button>
              <button
                type="button"
                className="m-account-primary-btn tap-scale"
                disabled={busy || !approveOk}
                onClick={() =>
                  setConfirm({
                    title: t("confirmApproveTitle"),
                    message: t("confirmApprove", { company }),
                    tone: "primary",
                    action: "approve",
                  })
                }
              >
                {t("approve")}
              </button>
            </div>
          ) : deleteOk && canEdit ? (
            <button
              type="button"
              className="m-account-danger-btn tap-scale"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: row.status === "rejected" ? t("confirmRevertTitle") : t("confirmDeleteTitle"),
                  message:
                    row.status === "rejected"
                      ? t("confirmRevert", { company })
                      : t("confirmDelete", { company }),
                  tone: "danger",
                  action: "delete",
                })
              }
            >
              {t("delete")}
            </button>
          ) : null
        }
      >
        <div className="m-ar-detail">
          <div className="m-ar-detail-head">
            <strong>{company}</strong>
            <span className={`m-ar-status m-ar-status--${row.status || "pending"}`}>
              {statusLabel(row.status, t)}
            </span>
          </div>
          {row.owner_name ? <p className="m-ar-detail-sub">{row.owner_name}</p> : null}

          <dl className="m-ar-meta">
            <div>
              <dt>{t("expirationDate")}</dt>
              <dd>{row.expiration_date || t("notSet")}</dd>
            </div>
            <div>
              <dt>{t("timeRemaining")}</dt>
              <dd>{formatRemainingForRow(row, t)}</dd>
            </div>
            <div>
              <dt>{t("colPrice")}</dt>
              <dd>{price > 0 ? formatDomainFeeDisplay2(price) : "—"}</dd>
            </div>
          </dl>

          {pendingEditable ? (
            <div className="m-ar-form">
              <label className="m-ar-field">
                <span>{t("renewalPeriod")}</span>
                <select
                  className="m-tx-form-select"
                  value={draft.period || ""}
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, period: e.target.value }))}
                >
                  <option value="">{t("selectPeriod")}</option>
                  {AUTO_RENEW_PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(p.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="m-ar-field">
                <span>{t("selectFromAccount")}</span>
                <select
                  className="m-tx-form-select"
                  value={String(draft.fromAccountId || "")}
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, fromAccountId: e.target.value }))}
                >
                  <option value="">{t("selectFromAccount")}</option>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="m-ar-field">
                <span>{t("selectToAccount")}</span>
                <select
                  className="m-tx-form-select"
                  value={String(draft.toAccountId || "")}
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, toAccountId: e.target.value }))}
                >
                  <option value="">{t("selectToAccount")}</option>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              {approveHint ? <p className="m-ar-hint">{approveHint}</p> : null}
            </div>
          ) : (
            <dl className="m-ar-meta">
              <div>
                <dt>{t("renewalPeriod")}</dt>
                <dd>{periodLabelKey ? t(periodLabelKey) : t("notSet")}</dd>
              </div>
            </dl>
          )}
        </div>
      </Sheet>

      <Sheet
        open={open && showConfirm}
        title={confirm?.title || t("confirmTitle")}
        onClose={() => setConfirm(null)}
        elevate
        footer={
          <div className="m-account-footer-actions">
            <button
              type="button"
              className="m-account-secondary-btn tap-scale"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={`${
                confirm?.tone === "primary" ? "m-account-primary-btn" : "m-account-danger-btn"
              } tap-scale`}
              disabled={busy}
              onClick={() => {
                void (async () => {
                  let ok = false;
                  if (confirm?.action === "approve") {
                    const values = getRowDraftValues(row, draft);
                    ok = await onApprove?.({
                      requestId: row.request_id,
                      period: values.period,
                      fromAccountId: values.fromAccountId,
                      toAccountId: values.toAccountId,
                    });
                  } else if (confirm?.action === "reject") {
                    ok = await onReject?.({ requestId: row.request_id });
                  } else if (confirm?.action === "delete") {
                    ok = await onDelete?.(row);
                  }
                  setConfirm(null);
                  if (ok) onClose?.();
                })();
              }}
            >
              {busy ? t("processing") : t("confirm")}
            </button>
          </div>
        }
      >
        <p className="m-ar-confirm-msg">{confirm?.message || ""}</p>
      </Sheet>
    </>
  );
}
