export function DashboardCompanyAccessModal({ open, message, onClose }) {
  if (!open) return null;
  return (
    <div className="dashboard-alert-modal-overlay" aria-hidden="false">
      <div className="dashboard-alert-modal-box" role="dialog" aria-labelledby="dashboardAlertModalTitle">
        <div className="dashboard-alert-modal-icon-wrap">
          <i className="fas fa-exclamation-triangle dashboard-alert-modal-icon" aria-hidden="true" />
        </div>
        <h3 id="dashboardAlertModalTitle" className="dashboard-alert-modal-title">
          Notice
        </h3>
        <p className="dashboard-alert-modal-message">{message}</p>
        <div className="dashboard-alert-modal-actions">
          <button
            type="button"
            className="dashboard-alert-modal-btn dashboard-alert-modal-btn-primary"
            onClick={onClose}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
