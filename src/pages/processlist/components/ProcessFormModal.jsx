import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";
import RemoveWordChipInput from "../../../components/RemoveWordChipInput.jsx";
import { toProcessFormUpperInput } from "../processListHelpers.js";
import { useSubmitGuard } from "../../../hooks/useSubmitGuard.js";
import ProcessFormPortalSelect from "./ProcessFormPortalSelect.jsx";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";

const DAY_NAME_MAP = {
  "MON": "dayMonday",
  "TUE": "dayTuesday",
  "WED": "dayWednesday",
  "THU": "dayThursday",
  "FRI": "dayFriday",
  "SAT": "daySaturday",
  "SUN": "daySunday",
  "Monday": "dayMonday",
  "Tuesday": "dayTuesday",
  "Wednesday": "dayWednesday",
  "Thursday": "dayThursday",
  "Friday": "dayFriday",
  "Saturday": "daySaturday",
  "Sunday": "daySunday",
};

function sortedCopyFromOptions(existingProcesses) {
  if (!existingProcesses?.length) return [];
  return [...existingProcesses].sort((a, b) => {
    const aName = (a.process_name || "Unknown").toUpperCase();
    const bName = (b.process_name || "Unknown").toUpperCase();
    if (aName !== bName) return aName.localeCompare(bName);
    const aDesc = (a.description_name || "No Description").toUpperCase();
    const bDesc = (b.description_name || "No Description").toUpperCase();
    return aDesc.localeCompare(bDesc);
  });
}

/** Unique process_name rows for Multi-Process checkboxes (js/processlist.js). */
function uniqueProcessesForMultiUse(existingProcesses) {
  const seen = new Set();
  const out = [];
  for (const p of existingProcesses || []) {
    const name = p.process_name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(p);
  }
  return out;
}

export default function ProcessFormModal({
  editMode,
  form,
  setForm,
  scopeCompanyId = null,
  currencies,
  days,
  readOnly = false,
  onClose,
  onSubmit,
  onOpenDescriptionPicker,
  onCopyFromSelect,
  t,
}) {
  const ro = Boolean(readOnly);
  const { submitting, guardSubmit } = useSubmitGuard(true);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySearch, setCopySearch] = useState("");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const copySearchRef = useRef(null);

  const copyOptions = useMemo(() => sortedCopyFromOptions(form.existingProcesses), [form.existingProcesses]);
  const filteredCopy = useMemo(() => {
    const q = copySearch.trim().toLowerCase();
    if (!q) return copyOptions;
    return copyOptions.filter((p) => {
      const line = `${p.process_name || ""} ${p.description_name || ""}`.toLowerCase();
      return line.includes(q);
    });
  }, [copyOptions, copySearch]);

  const copyListCount = filteredCopy.length + 1;

  const copyKeyboard = useListboxKeyboard({
    open: copyOpen,
    itemCount: copyListCount,
    resetToken: copySearch,
  });

  const currencyListCount = currencies.length + 1;

  const getCurrencyItemLabel = useCallback(
    (idx) => {
      if (idx === 0) return t("clear");
      const c = currencies[idx - 1];
      return c ? `${c.code || ""} - ${c.name || ""}` : "";
    },
    [currencies, t],
  );

  const currencyKeyboard = useListboxKeyboard({
    open: currencyOpen,
    itemCount: currencyListCount,
    getItemLabel: getCurrencyItemLabel,
  });

  const multiUseRows = useMemo(() => uniqueProcessesForMultiUse(form.existingProcesses), [form.existingProcesses]);

  const descSummary =
    form.selected_descriptions?.length > 0
      ? t("descriptionsSelectedCount", { count: form.selected_descriptions.length })
      : "";

  const placeholderBtn = t("selectProcessToCopyFrom");
  const selectedCopyRow = copyOptions.find(
    (p) =>
      String(p.process_id) === String(form.copy_from) ||
      String(p.process_name || "") === String(form.copy_from),
  );
  const selectedCurrency = currencies.find((c) => String(c.id) === String(form.currency_id));

  useEffect(() => {
    if (!copyOpen) {
      setCopySearch("");
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => copySearchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [copyOpen]);

  const applyCopyFromSelection = useCallback(
    (processId) => {
      setCopyOpen(false);
      setCopySearch("");
      void onCopyFromSelect?.(processId ?? "");
    },
    [onCopyFromSelect],
  );

  return (
    <ProcessModalPortal>
    <div id={editMode ? "editModal" : "addModal"} className="modal" style={processModalBackdropStyle}>
      <div className="modal-content process-form-modal">
        <div className="modal-header process-form-modal-header">
          <h2>{editMode ? t("editProcess") : t("addProcess")}</h2>
          <span className="close" onClick={onClose} role="presentation">
            &times;
          </span>
        </div>
        <form className="process-form-modal-shell" onSubmit={guardSubmit(onSubmit)}>
          <div className="modal-body">
            <div className="process-form add-grid">
            <div className="add-col">
              <div className="process-form-section">
                <h3 className="account-section-header">{t("processFormSectionBasic")}</h3>
              {!editMode && (
                <div className="form-row">
                  <div className="form-group">
                    <label>{t("copyFrom")}</label>
                    <ProcessFormPortalSelect
                      open={copyOpen}
                      onOpenChange={setCopyOpen}
                      disabled={ro}
                      hasSearch
                      onButtonKeyDown={(e) => {
                        if (
                          !copyOpen &&
                          e.key.length === 1 &&
                          !e.ctrlKey &&
                          !e.metaKey &&
                          !e.altKey
                        ) {
                          e.preventDefault();
                          setCopySearch(e.key.toUpperCase());
                          setCopyOpen(true);
                          return;
                        }
                        copyKeyboard.handleButtonKeyDown(e, {
                          isOpen: copyOpen,
                          onToggleOpen: () => setCopyOpen(true),
                          onClose: () => setCopyOpen(false),
                          len: copyListCount,
                          onSelectIndex: (idx) => {
                            if (idx === 0) {
                              applyCopyFromSelection("");
                            } else {
                              const p = filteredCopy[idx - 1];
                              if (p) applyCopyFromSelection(String(p.process_id ?? ""));
                            }
                          },
                        });
                      }}
                      displayLabel={
                        selectedCopyRow
                          ? `${selectedCopyRow.process_name || t("unknown")} - ${selectedCopyRow.description_name || t("noDescription")}`
                          : placeholderBtn
                      }
                    >
                      {({ optionsMaxHeight }) => (
                        <>
                          <div className="custom-select-search">
                            <input
                              ref={copySearchRef}
                              type="text"
                              placeholder={t("searchProcess")}
                              autoComplete="off"
                              value={copySearch}
                              disabled={ro}
                              onChange={(e) => setCopySearch(e.target.value.toUpperCase())}
                              onKeyDown={(e) => {
                                copyKeyboard.handleListKeyDown(e, {
                                  len: copyListCount,
                                  onSelectIndex: (idx) => {
                                    if (idx === 0) {
                                      applyCopyFromSelection("");
                                    } else {
                                      const p = filteredCopy[idx - 1];
                                      if (p) applyCopyFromSelection(String(p.process_id ?? ""));
                                    }
                                  },
                                  onClose: () => setCopyOpen(false),
                                });
                              }}
                            />
                          </div>
                          <div
                            ref={copyKeyboard.listRef}
                            className="custom-select-options"
                            style={{ flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight }}
                          >
                            <div
                              className={`custom-select-option${copyKeyboard.highlightClass(0)}`}
                              role="button"
                              data-kb-idx={0}
                              onMouseEnter={() => copyKeyboard.setHighlightIdx(0)}
                              onClick={() => applyCopyFromSelection("")}
                            >
                              {t("clear")}
                            </div>
                            {filteredCopy.map((p, idx) => {
                              const kbIdx = idx + 1;
                              return (
                              <div
                                key={`${p.process_id}_${p.description_name || ""}`}
                                className={`custom-select-option${copyKeyboard.highlightClass(kbIdx)}`}
                                role="button"
                                data-kb-idx={kbIdx}
                                onMouseEnter={() => copyKeyboard.setHighlightIdx(kbIdx)}
                                onClick={() => applyCopyFromSelection(String(p.process_id ?? ""))}
                              >
                                {`${p.process_name || t("unknown")} - ${p.description_name || t("noDescription")}`}
                              </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </ProcessFormPortalSelect>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor={editMode ? "edit_process_name" : "add_process_id"}>
                    {editMode ? t("processNameRequired") : t("processIdRequired")}
                  </label>
                  <div className={!editMode ? "input-with-checkbox" : ""}>
                    <input
                      id={editMode ? "edit_process_name" : "add_process_id"}
                      value={form.process_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, process_name: toProcessFormUpperInput(e.target.value) }))}
                      style={
                        editMode || form.is_multi_process
                          ? { backgroundColor: "#f5f5f5", cursor: "not-allowed" }
                          : { textTransform: "uppercase" }
                      }
                      required={!form.is_multi_process}
                      readOnly={editMode || form.is_multi_process}
                      disabled={ro}
                      placeholder={t("enterProcessId")}
                    />
                    {!editMode && (
                      <button
                        type="button"
                        className={`btn btn-multi-process-toggle${form.is_multi_process ? " is-on" : ""}`}
                        disabled={ro}
                        aria-pressed={Boolean(form.is_multi_process)}
                        onClick={() => {
                          const next = !form.is_multi_process;
                          const prevCopyFrom = form.copy_from;
                          setForm((prev) => ({
                            ...prev,
                            is_multi_process: next,
                            show_multi_process_selection: true,
                            selected_processes: next ? prev.selected_processes : [],
                            process_name: next ? "" : prev.process_name,
                          }));
                          if (next && prevCopyFrom) {
                            void onCopyFromSelect?.(prevCopyFrom);
                          }
                        }}
                      >
                        {t("multiProcess")}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {!editMode &&
                form.is_multi_process &&
                (form.show_multi_process_selection !== false ||
                  !(form.selected_processes?.length > 0)) && (
                <div className="form-row" id="multi_use_processes">
                  <div className="form-group">
                    <label>{t("selectMultiUseProcesses")}</label>
                    <div className="process-checkboxes" id="process_checkboxes">
                      {multiUseRows.map((p) => (
                        <div key={p.process_name} className="checkbox-item" title={p.process_name}>
                          <input
                            type="checkbox"
                            id={`mp_${p.process_name.replace(/[^a-zA-Z0-9_]/g, "_")}`}
                            checked={(form.selected_processes || []).includes(p.process_name)}
                            disabled={ro}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setForm((prev) => {
                                const nextList = checked
                                  ? [...(prev.selected_processes || []), p.process_name]
                                  : (prev.selected_processes || []).filter((name) => name !== p.process_name);
                                return { ...prev, selected_processes: nextList };
                              });
                            }}
                          />
                          <label htmlFor={`mp_${p.process_name.replace(/[^a-zA-Z0-9_]/g, "_")}`}>{p.process_name}</label>
                        </div>
                      ))}
                    </div>
                    {(form.selected_processes?.length ?? 0) > 0 && (
                      <div className="multi-use-actions">
                        <button
                          type="button"
                          className="btn btn-save btn-multi-use-confirm"
                          disabled={ro}
                          onClick={() =>
                            setForm((prev) => ({ ...prev, show_multi_process_selection: false }))
                          }
                        >
                          {t("confirm")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!editMode &&
                form.is_multi_process &&
                form.show_multi_process_selection === false &&
                (form.selected_processes?.length ?? 0) > 0 && (
                <div className="form-row" id="selected_processes_display">
                  <div className="form-group">
                    <label>{t("selectedMultiUseProcesses")}</label>
                    <div className="selected-processes" id="selected_processes_list">
                      {form.selected_processes?.map((name) => (
                        <div key={name} className="selected-process-item" title={name}>
                          <span>{name}</span>
                          <button
                            type="button"
                            className="remove-process"
                            disabled={ro}
                            onClick={() =>
                              setForm((prev) => {
                                const nextList = prev.selected_processes.filter((n) => n !== name);
                                return {
                                  ...prev,
                                  selected_processes: nextList,
                                  show_multi_process_selection: nextList.length === 0 ? true : false,
                                };
                              })
                            }
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor={editMode ? "edit_description" : "add_description"}>
                    {editMode ? t("description") : t("descriptionRequired")}
                  </label>
                  <div
                    className={`description-input-wrap dc-description-input-wrap${ro ? "" : " description-input-wrap--interactive"}`}
                    role={ro ? undefined : "button"}
                    tabIndex={ro ? undefined : 0}
                    title={t("chooseDescription")}
                    onClick={() => !ro && onOpenDescriptionPicker()}
                    onKeyDown={(e) => {
                      if (!ro && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onOpenDescriptionPicker();
                      }
                    }}
                  >
                    <input
                      id={editMode ? "edit_description" : "add_description"}
                      readOnly
                      required={!editMode}
                      tabIndex={-1}
                      value={descSummary}
                      placeholder={t("clickToSelectDescriptions")}
                    />
                    <button
                      type="button"
                      className="description-add-tile dc-description-add-tile"
                      aria-label={t("chooseDescription")}
                      disabled={ro}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!ro) onOpenDescriptionPicker();
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ display: form.selected_descriptions?.length > 0 ? "block" : "none" }}>
                <div className="form-group">
                  <label>{t("selectedDescriptions")}</label>
                  <div className="selected-descriptions" id="selected_descriptions_list">
                    {form.selected_descriptions?.map((desc) => (
                      <span key={desc.id} className="selected-description-tag">
                        {desc.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>{t("currencyColumn")}</label>
                  <ProcessFormPortalSelect
                    open={currencyOpen}
                    onOpenChange={setCurrencyOpen}
                    disabled={ro}
                    displayLabel={selectedCurrency ? selectedCurrency.code : t("selectCurrency")}
                    onButtonKeyDown={(e) => {
                      currencyKeyboard.handleButtonKeyDown(e, {
                        isOpen: currencyOpen,
                        onToggleOpen: () => setCurrencyOpen(true),
                        onClose: () => setCurrencyOpen(false),
                        len: currencyListCount,
                        onSelectIndex: (idx) => {
                          if (idx === 0) {
                            setForm((prev) => ({ ...prev, currency_id: "" }));
                            setCurrencyOpen(false);
                          } else {
                            const c = currencies[idx - 1];
                            if (c) {
                              setForm((prev) => ({ ...prev, currency_id: String(c.id) }));
                              setCurrencyOpen(false);
                            }
                          }
                        },
                      });
                    }}
                  >
                    {({ optionsMaxHeight }) => (
                      <div
                        ref={currencyKeyboard.listRef}
                        className="custom-select-options"
                        style={{ flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight }}
                      >
                        <div
                          className={`custom-select-option${!form.currency_id ? " selected" : ""}${currencyKeyboard.highlightClass(0)}`}
                          role="button"
                          data-kb-idx={0}
                          onMouseEnter={() => currencyKeyboard.setHighlightIdx(0)}
                          onClick={() => {
                            setForm((prev) => ({ ...prev, currency_id: "" }));
                            setCurrencyOpen(false);
                          }}
                        >
                          {t("selectCurrency")}
                        </div>
                        {currencies.map((c, idx) => {
                          const kbIdx = idx + 1;
                          return (
                          <div
                            key={c.id}
                            className={`custom-select-option${
                              String(c.id) === String(form.currency_id) ? " selected" : ""
                            }${currencyKeyboard.highlightClass(kbIdx)}`}
                            role="button"
                            data-kb-idx={kbIdx}
                            onMouseEnter={() => currencyKeyboard.setHighlightIdx(kbIdx)}
                            onClick={() => {
                              setForm((prev) => ({ ...prev, currency_id: String(c.id) }));
                              setCurrencyOpen(false);
                            }}
                          >
                            {c.code}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </ProcessFormPortalSelect>
                </div>
              </div>

              </div>

              {editMode && (
                <div className="process-form-section process-form-section--record">
                  <h3 className="account-section-header">{t("processFormSectionRecord")}</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t("dtsModified")}</label>
                      <div id="edit_dts_modified" className="process-form-dts-readonly">
                        <span id="edit_dts_modified_date">{form.dts_modified_display || ""}</span>
                        <span id="edit_dts_modified_user" className="process-form-dts-readonly-user">
                          {form.dts_modified_user_display || ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>{t("dtsCreated")}</label>
                      <div id="edit_dts_created" className="process-form-dts-readonly">
                        <span id="edit_dts_created_date">{form.dts_created || ""}</span>
                        <span id="edit_dts_created_user" className="process-form-dts-readonly-user">
                          {form.created_by || ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="add-col">
              <div className="process-form-section">
                <h3 className="account-section-header">{t("processFormSectionTextReplace")}</h3>
              <div className="form-row">
                <div className="form-group process-form-remove-word-group">
                  <label htmlFor={editMode ? "edit_remove_words" : "add_remove_words"}>{t("removeWords")}</label>
                  <RemoveWordChipInput
                    id={editMode ? "edit_remove_words" : "add_remove_words"}
                    name="remove_word"
                    value={form.remove_word}
                    onChange={(next) => setForm((prev) => ({ ...prev, remove_word: next }))}
                    processId={editMode && form.id ? form.id : null}
                    scopeCompanyId={scopeCompanyId}
                    placeholder={t("enterWordsToRemove")}
                    disabled={ro}
                  />
                  <small className="field-help">{t("removeWordsHelp")}</small>
                </div>
              </div>

              <div className="form-row row-two-cols">
                <div className="form-group">
                  <label>{t("replaceFrom")}</label>
                  <input
                    value={form.replace_word_from}
                    disabled={ro}
                    onChange={(e) => setForm((prev) => ({ ...prev, replace_word_from: toProcessFormUpperInput(e.target.value) }))}
                    placeholder={t("oldWord")}
                    style={{ textTransform: "uppercase" }}
                  />
                  <small className="field-help">{t("wordToBeReplaced")}</small>
                </div>
                <div className="form-group">
                  <label>{t("replaceTo")}</label>
                  <input
                    value={form.replace_word_to}
                    disabled={ro}
                    onChange={(e) => setForm((prev) => ({ ...prev, replace_word_to: toProcessFormUpperInput(e.target.value) }))}
                    placeholder={t("newWord")}
                    style={{ textTransform: "uppercase" }}
                  />
                  <small className="field-help">{t("replacementWord")}</small>
                </div>
              </div>

              </div>

              <div className="process-form-section">
                <h3 className="account-section-header">{t("processFormSectionScheduleNotes")}</h3>
              <div className="form-row">
                <div className="form-group">
                  <div className="day-use-pill-row">
                    <span className="user-gc-inline-label day-use-pill-heading">{t("dayUse")}</span>
                    <div
                      id={editMode ? "edit_day_checkboxes" : "day_checkboxes"}
                      className="user-gc-inline-pills day-use-pill-wrap"
                    >
                      <div className="user-gc-segment-group" role="group" aria-label={t("dayUse")}>
                        <button
                          type="button"
                          aria-pressed={days.length > 0 && form.day_use.length === days.length}
                          className={`user-gc-segment${
                            days.length > 0 && form.day_use.length === days.length ? " is-on" : ""
                          }`}
                          disabled={ro}
                          onClick={() => {
                            setForm((prev) => {
                              const allOn = days.length > 0 && prev.day_use.length === days.length;
                              return {
                                ...prev,
                                day_use: allOn ? [] : days.map((d) => String(d.id)),
                              };
                            });
                          }}
                        >
                          {t("allDay")}
                        </button>
                        {days.map((d) => {
                          const id = String(d.id);
                          const checked = form.day_use.includes(id);
                          const dayKey = d.day_name ? DAY_NAME_MAP[String(d.day_name).toUpperCase()] : null;
                          const displayText = dayKey ? t(dayKey) : String(d.day_name || "").toUpperCase();
                          return (
                            <button
                              key={id}
                              type="button"
                              className={`user-gc-segment${checked ? " is-on" : ""}`}
                              aria-pressed={checked}
                              disabled={ro}
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  day_use: checked
                                    ? prev.day_use.filter((x) => x !== id)
                                    : [...prev.day_use, id],
                                }));
                              }}
                            >
                              {displayText}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>{t("remarks")}</label>
                  <textarea
                    rows={5}
                    value={form.remark}
                    disabled={ro}
                    onChange={(e) => setForm((prev) => ({ ...prev, remark: toProcessFormUpperInput(e.target.value) }))}
                    placeholder={t("enterRemarks")}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
              </div>
              </div>
            </div>
            </div>
          </div>
          <div className="form-actions add-actions modal-footer process-form-modal-footer account-form-actions">
            <button type="submit" className="account-btn account-btn-save" disabled={ro || submitting}>
              {submitting ? t("saving") : editMode ? t("updateProcess") : t("addProcess")}
            </button>
            <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
