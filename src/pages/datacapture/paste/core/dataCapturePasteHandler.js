import {
  getClipboardPlainText,
  isGridPasteBlockedTarget,
  clipboardLooksLikeGridPaste,
  resolvePasteCell,
} from "./dataCaptureClipboard.js";
import { getDefaultPasteAnchorCell } from "./dataCapturePasteApply.js";
import {
  autoDetectCaptureTypeFromPaste,
  parseCitibetPasteData,
  shouldExitCitibetMode,
} from "./dataCapturePasteDetect.js";
import { handleCitibetPaste } from "../vendors/dataCaptureCitibetPaste.js";
import { handleTextModePaste } from "./dataCaptureTextPaste.js";
import { handleFormatCellPaste } from "./dataCaptureFormatPasteHandler.js";
import { handleGenericPaste } from "./dataCaptureGenericPaste.js";
import { handle4ReturnPaste, handleApiReturnPaste } from "../vendors/dataCaptureReturnPaste.js";
import { handleVPowerPaste } from "../vendors/dataCaptureVPowerPaste.js";
import { handleAgentLinkPaste } from "../vendors/dataCaptureAgentLinkPaste.js";
import { handleWbetPaste } from "../vendors/dataCaptureWbetPaste.js";
import { handleWbetApiPaste } from "../vendors/dataCaptureWbetApiPaste.js";
import { handleInvoicePaste } from "../vendors/dataCaptureInvoicePaste.js";
import { handle2SpecialPaste } from "../vendors/dataCapture2SpecialPaste.js";
import { handle3ApiPaste } from "../vendors/dataCapture3ApiPaste.js";
import { handleAwcPaste } from "../vendors/dataCaptureAwcHandlerPaste.js";
import { handlePegasusPaste } from "../vendors/dataCapturePegasusPaste.js";
import { handleAlipayPaste } from "../vendors/dataCaptureAlipayPaste.js";
import { handleC8PlayPaste } from "../vendors/dataCaptureC8PlayPaste.js";
import { handleMaxbetPaste } from "../vendors/dataCaptureMaxbetPaste.js";
import {
  applyActiveCaptureType,
  getActiveCaptureType,
  setTableActiveForPaste,
} from "../../lib/dataCaptureBridge.js";

/** Capture types with dedicated paste handlers in React. */
export const TYPED_CAPTURE_TYPES = new Set([
  "4.RETURN",
  "API_RETURN",
  "VPOWER",
  "AGENT_LINK",
  "WBET",
  "WBET_API",
  "INVOICE",
  "2.SPECIAL",
  "3.API",
  "AWC",
  "PEGASUS",
  "ALIPAY",
  "C8PLAY",
  "MAXBET",
]);

/** @deprecated use TYPED_CAPTURE_TYPES */
export const SPECIAL_CAPTURE_TYPES = TYPED_CAPTURE_TYPES;

/** @deprecated use TYPED_CAPTURE_TYPES */
export const MIGRATED_PASTE_TYPES = new Set([
  "1.Text",
  "2.Format",
  "CITIBET",
  ...TYPED_CAPTURE_TYPES,
]);

/**
 * Route typed capture paste to the matching handler.
 * @returns {boolean}
 */
export function handleTypedCapturePaste(e, pastedData, captureType) {
  switch (captureType) {
    case "API_RETURN":
      return handleApiReturnPaste(e, pastedData);
    case "4.RETURN":
      return handle4ReturnPaste(e, pastedData);
    case "VPOWER":
      return handleVPowerPaste(e, pastedData);
    case "AGENT_LINK":
      return handleAgentLinkPaste(e, pastedData);
    case "WBET":
      return handleWbetPaste(e, pastedData);
    case "WBET_API":
      return handleWbetApiPaste(e, pastedData);
    case "INVOICE":
      return handleInvoicePaste(e, pastedData);
    case "2.SPECIAL":
      return handle2SpecialPaste(e, pastedData);
    case "3.API":
      return handle3ApiPaste(e, pastedData);
    case "AWC":
      return handleAwcPaste(e, pastedData);
    case "PEGASUS":
      return handlePegasusPaste(e, pastedData);
    case "ALIPAY":
      return handleAlipayPaste(e, pastedData);
    case "C8PLAY":
      return handleC8PlayPaste(e, pastedData);
    case "MAXBET":
      return handleMaxbetPaste(e, pastedData);
    default:
      return false;
  }
}

/** @deprecated */
export function handleSpecialFormatPaste(e, pastedData, captureType) {
  return handleTypedCapturePaste(e, pastedData, captureType);
}

function invokeGenericPasteFallback(e, pastedData) {
  return handleGenericPaste(e, pastedData);
}

/**
 * Global paste for 1.Text / CITIBET / 4.RETURN etc. when focus is outside the grid.
 */
export function handleGlobalGridPaste(e) {
  const captureType = getActiveCaptureType();
  if (captureType === "2.Format") return;
  if (isGridPasteBlockedTarget(e.target)) return;
  if (e.target?.closest?.("#dataTable")) return;
  if (e.defaultPrevented) return;

  const clipboard = e.clipboardData || window.clipboardData;
  if (!clipboard || !clipboardLooksLikeGridPaste(clipboard)) return;

  const anchorCell = getDefaultPasteAnchorCell();
  if (!anchorCell) return;

  e.preventDefault();
  e.stopPropagation();

  setTableActiveForPaste();
  handleCellPasteEvent({ ...e, target: anchorCell, currentTarget: anchorCell });
}

/**
 * Full paste orchestrator — all formats in React.
 */
export function handleCellPasteEvent(e) {
  const cell = resolvePasteCell(e.target);

  e.preventDefault();

  const pastedData = getClipboardPlainText(e);
  const detected = autoDetectCaptureTypeFromPaste(pastedData);
  if (detected) {
    applyActiveCaptureType(detected);
  } else if (shouldExitCitibetMode(pastedData, getActiveCaptureType())) {
    applyActiveCaptureType("1.Text");
  }

  const captureType = getActiveCaptureType();

  if (captureType === "2.Format") {
    if (handleFormatCellPaste(e, pastedData)) return;
    invokeGenericPasteFallback(e, pastedData);
    return;
  }

  if (TYPED_CAPTURE_TYPES.has(captureType)) {
    if (handleTypedCapturePaste(e, pastedData, captureType)) return;
    invokeGenericPasteFallback(e, pastedData);
    return;
  }

  if (captureType === "1.Text") {
    if (handleTextModePaste(e, pastedData, cell)) return;
  }

  const citibetParsed = parseCitibetPasteData(pastedData, captureType);
  if (citibetParsed) {
    if (handleCitibetPaste(e, pastedData, cell, captureType, citibetParsed)) return;
  }

  invokeGenericPasteFallback(e, pastedData);
}
