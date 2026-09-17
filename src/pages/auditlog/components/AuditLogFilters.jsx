import { Search } from "lucide-react";
import { Card } from "./ui/Card.jsx";
import { Input, Select } from "./ui/Input.jsx";
import { PillSwitch } from "./ui/PillSwitch.jsx";
import { AuditLogDateRangePicker } from "./AuditLogDateRangePicker.jsx";
import { TOP_LEVEL_MODULES } from "../lib/moduleMap.js";
import { cn } from "../lib/cn.js";

const TYPE_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "CREATE", label: "CREATE" },
  { value: "UPDATE", label: "UPDATE" },
  { value: "DELETE", label: "DELETE" },
];

export function AuditLogFilters({ filters, onChange, tenantOptions }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <Card className="flex flex-wrap items-end gap-[12px] p-[10px]" style={{ boxShadow: "none" }}>
      <Field label="日期">
        <AuditLogDateRangePicker
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={(dateFrom, dateTo) => set({ dateFrom, dateTo })}
        />
      </Field>

      <Field label="公司" className="w-[180px]">
        <Select value={filters.tenantCode} onChange={(e) => set({ tenantCode: e.target.value })}>
          <option value="">全部公司</option>
          {tenantOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="模块" className="w-[180px]">
        <Select value={filters.module} onChange={(e) => set({ module: e.target.value })}>
          <option value="">全部模块</option>
          {TOP_LEVEL_MODULES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="搜索" className="w-[220px]">
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--al-muted-foreground)]" />
          <Input
            className="w-full pl-[28px]"
            type="text"
            placeholder="操作人 / 记录ID"
            value={filters.keyword}
            onChange={(e) => set({ keyword: e.target.value })}
          />
        </div>
      </Field>

      <PillSwitch options={TYPE_OPTIONS} value={filters.action} onChange={(action) => set({ action })} />
    </Card>
  );
}

function Field({ label, children, className }) {
  return (
    <div className={cn("flex flex-col gap-[5px]", className)}>
      <label className="text-[length:var(--text-tiny)] font-semibold uppercase tracking-wide text-[var(--al-muted-foreground)]">
        {label}
      </label>
      {children}
    </div>
  );
}
