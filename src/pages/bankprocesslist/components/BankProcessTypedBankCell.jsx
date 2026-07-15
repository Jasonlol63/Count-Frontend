import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PortalTooltip from "../../../components/PortalTooltip.jsx";
import { isTextTruncated } from "../../../utils/dom/isTextTruncated.js";
import { formatBankWithTypeDisplay } from "../lib/bankProcessHelpers.js";
import MaintenanceEllipsisText from "../../maintenance/shared/MaintenanceEllipsisText.jsx";

/** Bank column: plain text or name/(type) layout with portal tooltip when truncated. */
export default function BankProcessTypedBankCell({ bank, type }) {
  const display = formatBankWithTypeDisplay(bank, type);
  const bankName = String(bank ?? "").trim();
  const bankType = String(type ?? "").trim();

  const nameRef = useRef(null);
  const typeRef = useRef(null);
  const [truncated, setTruncated] = useState(false);

  const measure = useCallback(() => {
    const nameEl = nameRef.current;
    const typeEl = typeRef.current;
    setTruncated(isTextTruncated(nameEl) || isTextTruncated(typeEl));
  }, []);

  useLayoutEffect(() => {
    if (!bankType) return undefined;
    measure();
    const observers = [];
    [nameRef, typeRef].forEach((ref) => {
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
      observers.push(ro);
    });
    return () => observers.forEach((ro) => ro.disconnect());
  }, [display, bankType, measure]);

  useEffect(() => {
    if (!bankType) return undefined;
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [bankType, measure]);

  if (display === "-") return "-";
  if (!bankType) {
    return <MaintenanceEllipsisText value={display} className="bank-process-cell-text" />;
  }

  return (
    <PortalTooltip
      content={display}
      enabled={truncated && display !== "-"}
      placement="below"
      tooltipClassName="app-portal-tooltip--multiline"
    >
      <span className="bank-cell-display bank-cell-display--typed">
        <span ref={nameRef} className="bank-cell-display__name">
          {bankName}
        </span>
        <span ref={typeRef} className="bank-cell-display__type">
          ({bankType})
        </span>
      </span>
    </PortalTooltip>
  );
}
