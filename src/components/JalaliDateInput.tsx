"use client";

import { daysAgo, faDigits, faNum } from "@/lib/format";
import { JALALI_MONTHS, daysInJalaliMonth, isoToJalali, jalaliToIso, type JalaliParts } from "@/lib/jalali";

function safeJalaliParts(isoLike: string): JalaliParts {
  try {
    const safeIso = isoLike && /^\d{4}-\d{2}-\d{2}$/.test(isoLike) ? isoLike : daysAgo(0);
    const parts = isoToJalali(safeIso);
    if (parts.some((n) => !Number.isFinite(n))) throw new Error("bad jalali parts");
    if (parts[1] < 1 || parts[1] > 12) throw new Error("bad month");
    return parts;
  } catch {
    return isoToJalali(daysAgo(0));
  }
}

type Props = {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
};

export default function JalaliDateInput({ value, onChange, className }: Props) {
  const [jy, jm, jd] = safeJalaliParts(value);
  const maxDay = daysInJalaliMonth(jy, jm) || 29;

  const set = (ny: number, nm: number, nd: number) => {
    try {
      const clampedD = Math.min(Math.max(1, nd), daysInJalaliMonth(ny, nm) || 29);
      const iso = jalaliToIso(ny, nm, clampedD);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(new Date(iso + "T00:00:00").getTime())) {
        throw new Error("bad iso result");
      }
      onChange(iso);
    } catch {
      onChange(daysAgo(0));
    }
  };

  const years = [];
  for (let y = jy - 2; y <= jy + 3; y++) years.push(y);

  const selectCls =
    "rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-2 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]";

  return (
    <div className={"flex gap-1.5 " + (className || "")}>
      <select value={jd} onChange={(e) => set(jy, jm, Number(e.target.value))} className={selectCls + " w-16"}>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{faNum(d)}</option>
        ))}
      </select>
      <select value={jm} onChange={(e) => set(jy, Number(e.target.value), jd)} className={selectCls + " flex-1"}>
        {JALALI_MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select value={jy} onChange={(e) => set(Number(e.target.value), jm, jd)} className={selectCls + " w-20"}>
        {years.map((y) => (
          <option key={y} value={y}>{faDigits(y)}</option>
        ))}
      </select>
    </div>
  );
}
