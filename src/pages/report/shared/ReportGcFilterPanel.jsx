import GcInlineFilterPanel from "../../../components/GcInlineFilterPanel.jsx";

/**
 * Process List（user-gc-inline-panel）同款：GroupID / Company / Currency 分段控件。
 */
export default function ReportGcFilterPanel({
  groupIds,
  groupFilterKind,
  selectedGroupKey,
  selectedGroup,
  onPickAllGroups,
  onPickGroup,
  companyButtons,
  companyId,
  /** 乐观高亮：切换会话未返回前显示为已选 */
  highlightCompanyId,
  onSwitchCompany,
  onClearCompany,
  /** When false (company login), clicking the active company pill does not clear selection. */
  allowClearCompany = true,
  /** "dashboard" = embedded GcInlineFilterPanel layout (not the Home dashboard route). */
  layout = "legacy",
  /** Group/Company "All" pills — only the Home dashboard enables this. */
  showAllOption = false,
  groupsAllMode = false,
  groupAllMode = false,
  onPickAllInGroup,
  currencyList,
  showAllCurrencies,
  selectedCurrencies,
  toggleAllCurrencies,
  toggleCurrency,
  t,
}) {
  const activeCompanyId = highlightCompanyId != null ? highlightCompanyId : companyId;
  const isDashboardLayout = layout === "dashboard";
  const hasGroup = Array.isArray(groupIds) && groupIds.length > 0;
  const hasCompanies = Array.isArray(companyButtons) && companyButtons.length > 0;
  const hasCurrency = Array.isArray(currencyList) && currencyList.length > 0;
  if (!hasGroup && !hasCompanies && !hasCurrency) return null;

  if (isDashboardLayout) {
    return (
      <div className="user-gc-inline-panel report-gc-inline-panel">
        {(hasGroup || hasCompanies) && (
          <GcInlineFilterPanel
            embedded
            t={t}
            showAllOption={showAllOption}
            groupIds={groupIds}
            groupsAllMode={groupsAllMode}
            selectedGroup={selectedGroup}
            onPickAllGroups={onPickAllGroups}
            onPickGroup={onPickGroup}
            companiesForPicker={companyButtons}
            groupAllMode={groupAllMode}
            pickerCompanyId={activeCompanyId}
            onPickAllInGroup={onPickAllInGroup}
            onPickCompany={onSwitchCompany}
            allowCompanyDeselect={allowClearCompany}
            onClearCompanyPill={
              allowClearCompany
                ? (c) => {
                    if (onClearCompany) {
                      const g =
                        (selectedGroup && String(selectedGroup).trim().toUpperCase()) ||
                        (c?.group_id
                          ? String(c.group_id).trim().toUpperCase()
                          : "");
                      onClearCompany(g);
                      return;
                    }
                    if (onSwitchCompany) void onSwitchCompany(c);
                  }
                : null
            }
          />
        )}
        {hasCurrency ? (
          <div className="user-gc-inline-row">
            <span className="user-gc-inline-label">{t("currency")}</span>
            <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
              <div className="user-gc-segment-group" role="group" aria-label={t("currency")}>
                {toggleAllCurrencies ? (
                  <button
                    type="button"
                    className={`user-gc-segment${showAllCurrencies ? " is-on" : ""}`}
                    data-currency-code="ALL"
                    onClick={toggleAllCurrencies}
                  >
                    {t("currencyAll")}
                  </button>
                ) : null}
                {currencyList.map((row) => {
                  const code = row.code;
                  const on = !showAllCurrencies && selectedCurrencies.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      className={`user-gc-segment${on ? " is-on" : ""}`}
                      onClick={() => toggleCurrency(code)}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const groupHighlightKey = selectedGroupKey;

  return (
    <div className="user-gc-inline-panel report-gc-inline-panel">
      {hasGroup && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("groupId")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
              {showAllOption ? (
                <button
                  type="button"
                  className={`user-gc-segment${groupFilterKind === "all" ? " is-on" : ""}`}
                  onClick={onPickAllGroups}
                >
                  {t("groupFilterAll")}
                </button>
              ) : null}
              {groupIds.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`user-gc-segment${
                    groupFilterKind === "follow" && g === selectedGroupKey ? " is-on" : ""
                  }`}
                  onClick={() => onPickGroup(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {hasCompanies && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("company")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
              {companyButtons.map((c) => {
                const active = Number(c.id) === Number(activeCompanyId);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`user-gc-segment${active ? " is-on" : ""}`}
                    onClick={() => {
                      if (active && allowClearCompany) {
                        onClearCompany?.();
                        return;
                      }
                      if (!active) void onSwitchCompany(c);
                    }}
                  >
                    {String(c.company_id || "").toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {hasCurrency && (
        <div className="user-gc-inline-row">
          <span className="user-gc-inline-label">{t("currency")}</span>
          <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
            <div className="user-gc-segment-group" role="group" aria-label={t("currency")}>
              {toggleAllCurrencies ? (
                <button
                  type="button"
                  className={`user-gc-segment${showAllCurrencies ? " is-on" : ""}`}
                  data-currency-code="ALL"
                  onClick={toggleAllCurrencies}
                >
                  {t("currencyAll")}
                </button>
              ) : null}
              {currencyList.map((row) => {
                const code = row.code;
                const on = !showAllCurrencies && selectedCurrencies.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    className={`user-gc-segment${on ? " is-on" : ""}`}
                    onClick={() => toggleCurrency(code)}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
