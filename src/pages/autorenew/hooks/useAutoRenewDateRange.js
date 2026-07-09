import { useEffect, useMemo, useRef, useState } from "react";
import { parseDdMmYyyyToYmd } from "../../../utils/date/dateUtils.js";
import {
  bindMaintenanceCalendarDismissListeners,
  ensureMaintenanceDateRangePicker,
} from "../../../utils/date/dateRangePicker.js";
import { defaultDashboardDateRange, ymdToDmy } from "../../dashboard/lib/dashboardDateUtils.js";

export function useAutoRenewDateRangeState() {
  const defaults = defaultDashboardDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  return { dateFrom, setDateFrom, dateTo, setDateTo };
}

export function useAutoRenewDateRange({ me, ready, i18n, dateFrom, dateTo, setDateFrom, setDateTo }) {
  const pickerReadyRef = useRef(false);

  const periodPresets = useMemo(
    () => [
      ["today", i18n.today],
      ["yesterday", i18n.yesterday],
      ["thisWeek", i18n.thisWeek],
      ["lastWeek", i18n.lastWeek],
      ["thisMonth", i18n.thisMonth],
      ["lastMonth", i18n.lastMonth],
      ["thisYear", i18n.thisYear],
      ["lastYear", i18n.lastYear],
    ],
    [i18n],
  );

  useEffect(() => {
    bindMaintenanceCalendarDismissListeners();
  }, []);

  useEffect(() => {
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: i18n.selectDateRange,
      selectEndDateHint: i18n.selectEndDate,
      monthLabels: i18n.monthLabels,
    });
  }, [i18n]);

  useEffect(() => {
    if (!ready) return;
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const f = ymdToDmy(dateFrom);
    const t = ymdToDmy(dateTo);
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: "date_from",
      dateToId: "date_to",
      displayId: "date-range-display",
    });
  }, [ready, dateFrom, dateTo]);

  useEffect(() => {
    if (!me || !ready) return undefined;

    let cancelled = false;
    let attempts = 0;

    const tryInit = () => {
      if (cancelled) return;
      ensureMaintenanceDateRangePicker();

      const hasPopup = document.getElementById("calendar-popup");
      const hasPicker = document.getElementById("date-range-picker");
      const hasFrom = document.getElementById("date_from");
      const hasTo = document.getElementById("date_to");

      if (!window.MaintenanceDateRangePicker?.init || !hasPopup || !hasPicker || !hasFrom || !hasTo) {
        if (attempts < 30) {
          attempts += 1;
          requestAnimationFrame(tryInit);
        }
        return;
      }

      if (!pickerReadyRef.current) {
        window.MaintenanceDateRangePicker.init({
          allowEmpty: false,
          placeholder: i18n.selectDateRange,
          selectEndDateHint: i18n.selectEndDate,
          onChange: () => {
            const fromDmy =
              window.MaintenanceDateRangePicker.getDateFrom?.() ||
              document.getElementById("date_from")?.value ||
              "";
            const toDmy =
              window.MaintenanceDateRangePicker.getDateTo?.() ||
              document.getElementById("date_to")?.value ||
              "";
            const from = parseDdMmYyyyToYmd(fromDmy);
            const to = parseDdMmYyyyToYmd(toDmy);
            if (from && to) {
              setDateFrom(from);
              setDateTo(to);
            }
          },
        });
        pickerReadyRef.current = true;
      } else {
        window.MaintenanceDateRangePicker.bindPickers?.();
      }

      window.MaintenanceDateRangePicker.refreshInputsDisplay?.({
        dateFromId: "date_from",
        dateToId: "date_to",
        displayId: "date-range-display",
      });
    };

    tryInit();

    return () => {
      cancelled = true;
      pickerReadyRef.current = false;
    };
  }, [me, ready, i18n.selectDateRange, i18n.selectEndDate, setDateFrom, setDateTo]);

  return { periodPresets };
}
