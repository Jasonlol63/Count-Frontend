import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CONTAINER_EDGE_PAD = 8;
const PORTAL_GAP = 2;
const PROCESS_SEARCH_RESERVE = 52;
const PORTAL_DROPDOWN_CAP = 280;
const MIN_DROPDOWN_HEIGHT = 120;

function layoutProcessPortalDropdown(
  buttonEl,
  containerEl,
  { searchReserve = PROCESS_SEARCH_RESERVE, minMenu = MIN_DROPDOWN_HEIGHT, dropdownCap = PORTAL_DROPDOWN_CAP } = {},
) {
  const btnRect = buttonEl.getBoundingClientRect();
  const bounds = containerEl?.getBoundingClientRect();

  const boundTop = bounds ? bounds.top + CONTAINER_EDGE_PAD : 0;
  const boundBottom = bounds ? bounds.bottom - CONTAINER_EDGE_PAD : window.innerHeight;
  const boundLeft = bounds ? bounds.left + CONTAINER_EDGE_PAD : 0;
  const boundRight = bounds ? bounds.right - CONTAINER_EDGE_PAD : window.innerWidth;

  const width = btnRect.width;
  let left = btnRect.left;
  if (left + width > boundRight) left = Math.max(boundLeft, boundRight - width);
  if (left < boundLeft) left = boundLeft;

  const spaceBelow = Math.max(0, boundBottom - btnRect.bottom - PORTAL_GAP);
  const spaceAbove = Math.max(0, btnRect.top - PORTAL_GAP - boundTop);
  const openBelow = spaceBelow >= minMenu || spaceBelow >= spaceAbove;
  const available = openBelow ? spaceBelow : spaceAbove;
  const dropdownMaxHeight = Math.min(dropdownCap, Math.max(80, available));
  const optionsMaxHeight = Math.max(60, dropdownMaxHeight - searchReserve);

  return {
    optionsMaxHeight,
    menuStyle: {
      position: "fixed",
      left: `${left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${dropdownMaxHeight}px`,
      display: "flex",
      flexDirection: "column",
      top: openBelow ? `${btnRect.bottom + PORTAL_GAP}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - btnRect.top + PORTAL_GAP}px`,
      zIndex: 9000,
    },
  };
}

export default function DataCaptureProcessSelect({
  t,
  processOpen,
  setProcessOpen,
  selectedProcess,
  processFilter,
  setProcessFilter,
  processSearchInputRef,
  processListTruncated,
  processRowsCount,
  visibleProcesses,
  filteredProcesses,
  selectProcessRow,
  displayTextFromProcessRow,
  onBeforeToggle,
}) {
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(250);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutProcessPortalDropdown(
      btn,
      null,
    );
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, []);

  useLayoutEffect(() => {
    if (!processOpen) {
      setMenuStyle(null);
      return undefined;
    }
    positionMenu();
    const onReflow = () => positionMenu();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [processOpen, positionMenu]);

  const handleToggle = (e) => {
    e.stopPropagation();
    onBeforeToggle?.();
    const willOpen = !processOpen;
    if (willOpen) {
      positionMenu();
    } else {
      setMenuStyle(null);
    }
    setProcessOpen(willOpen);
  };

  const dropdownNode =
    processOpen && menuStyle ? (
      <div
        ref={dropdownRef}
        className="custom-select-dropdown show custom-select-dropdown-portal dc-process-select-portal"
        id="capture_process_dropdown"
        style={menuStyle}
      >
        <div className="custom-select-search">
          <input
            ref={processSearchInputRef}
            type="text"
            placeholder={t("searchProcess")}
            autoComplete="off"
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setProcessOpen(false);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const first = filteredProcesses[0];
                if (first) void selectProcessRow(first);
              }
            }}
          />
        </div>
        <div
          className="custom-select-options dc-react-process-options"
          style={{ flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight }}
        >
          {processListTruncated ? (
            <div
              className="custom-select-option custom-select-option--hint"
              style={{ cursor: "default", opacity: 0.85 }}
            >
              {t("typeToSearchProcesses", { count: processRowsCount })}
            </div>
          ) : null}
          {visibleProcesses.map((row) => (
            <div
              key={row.id}
              role="presentation"
              className="custom-select-option"
              onClick={() => void selectProcessRow(row)}
            >
              {displayTextFromProcessRow(row)}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="custom-select-wrapper" ref={wrapRef}>
      {/* Legacy `loadProcessesByDate` clears the first `.custom-select-options` — keep an empty decoy. */}
      <div
        className="custom-select-options dc-legacy-process-options-host"
        aria-hidden="true"
        style={{ display: "none" }}
      />
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${processOpen ? " open" : ""}`.trim()}
        id="capture_process"
        data-placeholder={t("selectProcess")}
        name="process"
        aria-expanded={processOpen}
        aria-haspopup="listbox"
        {...(selectedProcess?.id
          ? {
              "data-value": selectedProcess.id,
              "data-process-code": selectedProcess.process_id || "",
              ...(selectedProcess.description_name
                ? { "data-description-name": selectedProcess.description_name }
                : {}),
            }
          : {})}
        onClick={handleToggle}
      >
        {selectedProcess?.displayText || t("selectProcess")}
      </button>
      {dropdownNode ? createPortal(dropdownNode, document.body) : null}
    </div>
  );
}
