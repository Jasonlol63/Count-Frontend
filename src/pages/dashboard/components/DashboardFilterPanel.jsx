export function DashboardFilterPanel({
  i18n,
  effectiveDateRangeText,
  groupIds,
  selectedGroup,
  groupsAllMode,
  groupAllMode,
  companiesForPicker,
  companyId,
  mergedSubsetIds,
  currencies,
  currencyCode,
  onPickGroup,
  onPickAllGroups,
  onPickCompany,
  onPickAllInGroup,
  onCurrencyChange,
  onCurrencyDropOn,
}) {
  const showCompanyAll = companiesForPicker.length > 1;
  const showCompanyRow = groupIds.length > 0 || companiesForPicker.length > 0;
  const showPanel =
    groupIds.length > 0 || companiesForPicker.length > 0 || currencies.length > 0;

  return (
    <div className="dashboard-card dashboard-filter-panel action-buttons-container">
      <div className="dashboard-filter-date-row">
        <span className="user-gc-inline-label">{i18n.dateRange}</span>
        <div className="dashboard-filter-date-field report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--date">
          <div className="report-outlined-shell report-outlined-shell--no-label">
            <div className="report-outlined-inner">
              <div className="transaction-date-range-group">
                <div
                  className="date-range-picker"
                  id="date-range-picker"
                  role="button"
                  tabIndex={0}
                  aria-label={i18n.selectDateRange}
                >
                  <i className="fas fa-calendar-alt" />
                  <span id="date-range-display">{effectiveDateRangeText}</span>
                  <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                </div>
                <input type="hidden" id="date_from" readOnly />
                <input type="hidden" id="date_to" readOnly />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPanel && (
        <div className="user-gc-inline-panel">
          {groupIds.length > 0 && (
            <div className="user-gc-inline-row">
              <span className="user-gc-inline-label">{i18n.groupId}</span>
              <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                <div className="user-gc-segment-group" role="group" aria-label={i18n.groupId}>
                  <button
                    type="button"
                    className={`user-gc-segment${groupsAllMode ? " is-on" : ""}`}
                    onClick={() => void onPickAllGroups?.()}
                  >
                    {i18n.all}
                  </button>
                  {groupIds.map((gid) => (
                    <button
                      key={gid}
                      type="button"
                      className={`user-gc-segment${selectedGroup === gid && !groupsAllMode ? " is-on" : ""}`}
                      onClick={() => void onPickGroup(gid)}
                    >
                      {gid}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {showCompanyRow && (
            <div className="user-gc-inline-row">
              <span className="user-gc-inline-label">{i18n.company}</span>
              <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                <div className="user-gc-segment-group" role="group" aria-label={i18n.company}>
                  {showCompanyAll && (
                    <button
                      type="button"
                      className={`user-gc-segment${groupAllMode ? " is-on" : ""}`}
                      onClick={() => void onPickAllInGroup()}
                    >
                      {i18n.all}
                    </button>
                  )}
                  {companiesForPicker.map((c) => {
                    const id = parseInt(c.id, 10);
                    const active = groupAllMode
                      ? false
                      : mergedSubsetIds && mergedSubsetIds.length > 1
                        ? mergedSubsetIds.includes(id)
                        : parseInt(companyId, 10) === id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`user-gc-segment${active ? " is-on" : ""}`}
                        onClick={() => void onPickCompany(c)}
                      >
                        {String(c.company_id || "").toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {currencies.length > 0 && (
            <div className="user-gc-inline-row">
              <span className="user-gc-inline-label">{i18n.currency}</span>
              <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                <div
                  id="currency-buttons-container"
                  className="user-gc-segment-group"
                  role="group"
                  aria-label={i18n.currency}
                >
                  {currencies.map((code) => (
                    <button
                      key={code}
                      type="button"
                      draggable
                      title={i18n.currencyDragHint}
                      className={`user-gc-segment user-gc-segment--draggable-pill${currencyCode === code ? " is-on" : ""}`}
                      data-currency-code={code}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", code);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        void onCurrencyDropOn?.(e, code);
                      }}
                      onClick={() => onCurrencyChange(code)}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
