import { useEffect } from "react";

export default function ConfirmLogoutModal({ open, onCancel, onConfirm, loading = false, i18n = {} }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, loading]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal, 12000)",
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.confirmLogoutTitle || "Confirm logout"}
        style={{
          width: "100%",
          maxWidth: 450,
          boxSizing: "border-box",
          background: "var(--color-surface, #fff)",
          borderRadius: "var(--login-radius-xl, 28px)",
          boxShadow: "var(--shadow-card, 0 4px 20px rgba(0,0,0,0.12))",
          padding: "28px 24px",
        }}
      >
        <h3
          style={{
            margin: "0 0 8px",
            fontSize: "var(--text-h1)",
            fontWeight: 700,
            fontFamily: "var(--font-ui, system-ui, sans-serif)",
            color: "var(--color-body-strong, #1f2937)",
            textAlign: "center",
            lineHeight: 1.25,
          }}
        >
          {i18n.confirmLogoutTitle || "Confirm Logout"}
        </h3>
        <p
          style={{
            margin: "6px 0 24px",
            fontSize: "var(--text-medium)",
            fontWeight: 400,
            fontFamily: "var(--font-ui, system-ui, sans-serif)",
            color: "var(--color-muted-fg, #6b7280)",
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          {i18n.confirmLogoutMessage || "Are you sure you want to logout?"}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              border: "1px solid var(--color-border-muted, #d1d5db)",
              background: "var(--color-surface, #fff)",
              color: "var(--color-body-strong, #111827)",
              borderRadius: "var(--radius-panel, 1rem)",
              padding: "8px 16px",
              fontSize: "var(--text-base)",
              fontFamily: "var(--font-ui, system-ui, sans-serif)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {i18n.cancel || "Cancel"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              border: "none",
              background: "linear-gradient(135deg, var(--login-bg-start), var(--login-bg-end))",
              color: "#fff",
              borderRadius: "var(--radius-panel, 1rem)",
              padding: "8px 16px",
              fontSize: "var(--text-base)",
              fontWeight: 600,
              fontFamily: "var(--font-ui, system-ui, sans-serif)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? i18n.loggingOut || "Logging out..." : i18n.logout || "Logout"}
          </button>
        </div>
      </div>
    </div>
  );
}
