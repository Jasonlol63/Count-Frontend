import PortalTooltip from "./PortalTooltip.jsx";
import { useHoverCapablePointer } from "../hooks/useHoverCapablePointer.js";

/**
 * Sidebar icon-only mode: menu label in portal tooltip (mouse hover only).
 * Touch / phone: no floating labels — expand sidebar via hamburger instead.
 * @param {{
 *   label: string,
 *   enabled?: boolean,
 *   placement?: "top" | "below" | "right" | "auto-top",
 *   children: import("react").ReactNode,
 * }} props
 */
export default function SidebarMenuTooltip({
  label,
  enabled = true,
  placement = "right",
  children,
}) {
  const hoverCapable = useHoverCapablePointer();

  return (
    <PortalTooltip
      content={label}
      enabled={enabled && hoverCapable}
      placement={placement}
      showOnFocus={false}
      dismissOnPress
    >
      {children}
    </PortalTooltip>
  );
}
