import { getProcessModalDropdownZIndex } from "./ProcessModalPortal.jsx";

const PORTAL_EDGE_PAD = 16;
const PORTAL_GAP = 2;

/** Position a custom-select dropdown on document.body so modal overflow does not clip it. */
export function layoutPortalCustomSelect(
  buttonEl,
  wrapEl,
  { minWidth = 180, searchReserve = 0, minMenu = 160, dropdownCap = 260 } = {},
) {
  const rect = buttonEl.getBoundingClientRect();
  const width = Math.max(rect.width, minWidth);
  const spaceBelow = window.innerHeight - rect.bottom - PORTAL_EDGE_PAD;
  const spaceAbove = rect.top - PORTAL_EDGE_PAD;
  const openBelow = spaceBelow >= minMenu || spaceBelow >= spaceAbove;
  const viewportFit = Math.max(minMenu, openBelow ? spaceBelow : spaceAbove);
  const dropdownMaxHeight = Math.min(dropdownCap, viewportFit);
  const optionsMaxHeight = Math.max(100, dropdownMaxHeight - searchReserve);

  return {
    optionsMaxHeight,
    menuStyle: {
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${dropdownMaxHeight}px`,
      display: "flex",
      flexDirection: "column",
      top: openBelow ? `${rect.bottom + PORTAL_GAP}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + PORTAL_GAP}px`,
      zIndex: getProcessModalDropdownZIndex(wrapEl),
    },
  };
}
