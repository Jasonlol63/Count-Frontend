import React, { useCallback, useEffect, useState } from "react";
import "./systemMaintenanceMode.css";
import { fetchSystemMaintenanceMode, setSystemMaintenanceMode } from "../systemMaintenanceModeApi.js";

/**
 * IT-only global "kick everyone" switch — sits inline in the Published Maintenance Content
 * header (next to the list title), not a separate panel. See
 * docs/it-role-maintenance-mode-and-sidebar-fix.md.
 */
export function SystemMaintenanceModeSwitch({ t, onToggleFailed, onLoadFailed }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadStatus = useCallback(async (signal) => {
    try {
      const { json } = await fetchSystemMaintenanceMode();
      if (signal?.aborted) return;
      if (json.success) {
        setEnabled(Boolean(json.data?.enabled));
      } else {
        onLoadFailed?.(json.message || "Unknown error");
      }
    } catch (err) {
      if (!signal?.aborted) onLoadFailed?.(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [onLoadFailed]);

  useEffect(() => {
    const ac = new AbortController();
    loadStatus(ac.signal);
    return () => ac.abort();
  }, [loadStatus]);

  async function applyToggle(next) {
    setSubmitting(true);
    try {
      const { json } = await setSystemMaintenanceMode(next);
      if (json.success) {
        setEnabled(next);
      } else {
        onToggleFailed?.(json.message || "Unknown error");
      }
    } catch (err) {
      onToggleFailed?.(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="smm-switch-row">
      <span className="smm-switch-label">{t("maintenanceModeSwitchLabel")}</span>
      <label className={`smm-switch ${submitting || loading ? "is-disabled" : ""}`}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={loading || submitting}
          onChange={(e) => applyToggle(e.target.checked)}
        />
        <span className="smm-switch-track">
          <span className="smm-switch-thumb" />
        </span>
      </label>
    </div>
  );
}
