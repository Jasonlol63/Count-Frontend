import PortalTooltip from "../../../components/PortalTooltip.jsx";
import { parseMaintenanceDateTime } from "./maintenanceCreatedAtDisplay.js";

/**
 * Created At: date only; time in a fixed portal tooltip on hover.
 * @param {{ value?: string | null, fallback?: string }} props
 */
export default function MaintenanceCreatedAtDisplay({ value, fallback = "-" }) {
  const parsed = parseMaintenanceDateTime(value);
  if (!parsed) return fallback;

  const { date, time } = parsed;
  const hasTime = Boolean(time);

  const dateNode = (
    <span
      className={`maintenance-created-at-display${hasTime ? " maintenance-created-at-display--has-time" : ""}`}
      aria-label={hasTime ? `${date} ${time}` : date}
    >
      <span className="maintenance-created-at-date">{date}</span>
    </span>
  );

  if (!hasTime) return dateNode;

  return (
    <PortalTooltip content={time} placement="auto-top" anchorClassName="portal-tooltip-anchor--inline">
      {dateNode}
    </PortalTooltip>
  );
}
