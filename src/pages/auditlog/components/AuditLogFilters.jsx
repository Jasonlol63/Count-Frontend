import { Search } from "lucide-react";
import { Card } from "./ui/Card.jsx";
import { Input, Select } from "./ui/Input.jsx";
import { PillSwitch } from "./ui/PillSwitch.jsx";

const TYPE_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "CREATE", label: "CREATE" },
  { value: "UPDATE", label: "UPDATE" },
  { value: "DELETE", label: "DELETE" },
];

export function AuditLogFilters({ filters, onChange, tenantOptions, moduleOptions }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <Card className="flex flex-wrap items-center gap-[10px] p-[16px]">
      <Field label="日期">
        <Input type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
        <span className="text-[12px] text-[var(--al-muted-foreground)]">—</span>
        <Input type="date" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
      </Field>

      <Field label="公司">
        <Select value={filters.tenantCode} onChange={(e) => set({ tenantCode: e.target.value })}>
          <option value="">全部公司</option>
          {tenantOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="模块">
        <Select value={filters.module} onChange={(e) => set({ module: e.target.value })}>
          <option value="">全部模块</option>
          {moduleOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>

      <div className="relative">
        <Search size={12} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--al-muted-foreground)]" />
        <Input
          className="w-[176px] pl-[28px]"
          type="text"
          placeholder="操作人 / 记录ID"
          value={filters.keyword}
          onChange={(e) => set({ keyword: e.target.value })}
        />
      </div>

      <PillSwitch options={TYPE_OPTIONS} value={filters.action} onChange={(action) => set({ action })} />
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex items-center gap-[6px]">
      <label className="text-[11.5px] font-medium text-[var(--al-muted-foreground)]">{label}</label>
      {children}
    </div>
  );
}
