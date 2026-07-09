import { useEffect, useMemo, useRef, useState } from "react";
import { parseDdMmYyyyToYmd } from "../../../utils/date/dateUtils.js";
import {
  bindMaintenanceCalendarDismissListeners,
  ensureMaintenanceDateRangePicker,
} from "../../../utils/date/dateRangePicker.js";
import { defaultDashboardDateRange, ymdToDmy } from "../lib/dashboardDateUtils.js";

export function useDashboardDateRange({ me, i18n, dateFrom, dateTo, setDateFrom, setDateTo }) {
  const dashDatePickerReadyRef = useRef(false);

  const effectiveDateRangeText = useMemo(
    () => `${ymdToDmy(dateFrom)} - ${ymdToDmy(dateTo)}`,
    [dateFrom, dateTo]
  );

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
    [i18n]
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
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const f = ymdToDmy(dateFrom);
    const t = ymdToDmy(dateTo);
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!me) return undefined;
    let cancelled = false;
    ensureMaintenanceDateRangePicker();
    const initPicker = () => {
      if (cancelled || dashDatePickerReadyRef.current) return;
      if (!window.MaintenanceDateRangePicker?.init) return;
      if (!document.getElementById("calendar-popup")) return;
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
      dashDatePickerReadyRef.current = true;
      window.MaintenanceDateRangePicker?.refreshInputsDisplay?.();
    };
    initPicker();
    return () => {
      cancelled = true;
      dashDatePickerReadyRef.current = false;
    };
  }, [me, i18n.selectDateRange, i18n.selectEndDate, setDateFrom, setDateTo]);

  return { effectiveDateRangeText, periodPresets };
}

export function useDashboardDateRangeState() {
  const defaults = defaultDashboardDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  return { dateFrom, setDateFrom, dateTo, setDateTo };
}
