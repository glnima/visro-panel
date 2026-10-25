"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import JalaliDateInput from "./JalaliDateInput";
import { useToast } from "./Toast";
import { PageTitle, cardCls, secondaryBtn } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { addDays, daysBetween, todayISO } from "@/lib/dates";
import { faDigits, faNum, faPrice } from "@/lib/format";
import { JALALI_MONTHS, isoToJalali, jalaliToIso } from "@/lib/jalali";
import { isDelivered, orderTotals } from "@/lib/production";
import { STAGES, type Bootstrap, type StageKey } from "@/lib/types";

const BAR = "#9C7A3C";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={cardCls + " p-4"}>
      <div className="text-xs text-[#6B5E4F]">{label}</div>
      <div className="text-2xl font-bold mt-1 text-[#2B2420]">{value}</div>
      {note && <div className="text-[11px] text-[#8A7B60] mt-1">{note}</div>}
    </div>
  );
}

// Single-series horizontal bars: label, bar, value as text (so it reads as a table too).
function BarList({ rows, format }: { rows: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) return <div className="text-xs text-[#8A7B60] py-4 text-center">در این بازه چیزی ثبت نشده</div>;
  return (
    <div className="flex flex-col gap-2" role="table">
      {rows.map((r) => (
        <div key={r.label} role="row" title={`${r.label}: ${format(r.value)}`} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-xs group">
          <span role="cell" className="text-[#6B5E4F] truncate">{r.label}</span>
          <span role="cell" className="h-3 rounded-l-[4px] bg-transparent">
            <span
              className="block h-full rounded-l-[4px] group-hover:opacity-80"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: BAR, minWidth: r.value > 0 ? 2 : 0 }}
            />
          </span>
          <span role="cell" className="text-[#2B2420] font-medium tabular-nums">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsView({ data }: { data: Bootstrap }) {
  const toast = useToast();
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [throughput, setThroughput] = useState<Record<StageKey, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ byStage: Record<StageKey, number> }>("GET", `/api/reports/throughput?from=${from}&to=${to}`)
      .then((r) => !cancelled && setThroughput(r.byStage))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [from, to, toast, data.version]);

  const preset = (days: number) => {
    setFrom(addDays(today, -(days - 1)));
    setTo(today);
  };
  const thisMonth = () => {
    const [jy, jm] = isoToJalali(today);
    setFrom(jalaliToIso(jy, jm, 1));
    setTo(today);
  };

  const r = useMemo(() => {
    const inRange = (d: string) => d >= from && d <= to;
    const booked = data.orders.filter((o) => inRange(o.orderDate));
    const delivered = data.orders.filter((o) => o.deliveredAt && inRange(o.deliveredAt));
    const lateness = delivered.map((o) => daysBetween(o.requested, o.deliveredAt!));
    const onTime = lateness.filter((d) => d <= 0).length;
    const late = lateness.filter((d) => d > 0);
    const overdueNow = data.orders.filter((o) => !isDelivered(o) && o.requested < today);

    const months = new Map<string, number>();
    for (const o of booked) {
      const [jy, jm] = isoToJalali(o.orderDate);
      const key = `${jy}-${String(jm).padStart(2, "0")}`;
      months.set(key, (months.get(key) ?? 0) + orderTotals(o).price);
    }
    const byMonth = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        const [jy, jm] = key.split("-").map(Number);
        return { label: `${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`, value };
      });

    return {
      bookedCount: booked.length,
      revenue: booked.reduce((s, o) => s + orderTotals(o).price, 0),
      deliveredCount: delivered.length,
      onTimeRate: delivered.length ? Math.round((onTime / delivered.length) * 100) : null,
      avgLate: late.length ? Math.round(late.reduce((s, d) => s + d, 0) / late.length) : 0,
      lateCount: late.length,
      overdueNow: overdueNow.length,
      byMonth,
    };
  }, [data.orders, from, to, today]);

  const stationLabel = (k: StageKey) => data.stations.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle icon={<BarChart3 size={18} />} title="گزارش‌ها" />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          از
          <JalaliDateInput value={from} onChange={setFrom} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          تا
          <JalaliDateInput value={to} onChange={setTo} />
        </label>
        <div className="flex gap-2">
          <button onClick={thisMonth} className={secondaryBtn + " !py-1.5 text-xs"}>این ماه</button>
          <button onClick={() => preset(30)} className={secondaryBtn + " !py-1.5 text-xs"}>۳۰ روز</button>
          <button onClick={() => preset(90)} className={secondaryBtn + " !py-1.5 text-xs"}>۹۰ روز</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="فروش (سفارش‌های ثبت‌شده)" value={`${faPrice(r.revenue)}`} note={`تومان · ${faNum(r.bookedCount)} سفارش`} />
        <Tile
          label="تحویل به‌موقع"
          value={r.onTimeRate === null ? "—" : `${faNum(r.onTimeRate)}٪`}
          note={`${faNum(r.deliveredCount)} سفارش تحویل شد`}
        />
        <Tile label="میانگین دیرکرد" value={r.lateCount ? `${faNum(r.avgLate)} روز` : "—"} note={`${faNum(r.lateCount)} سفارش دیر تحویل شد`} />
        <Tile label="عقب‌افتاده‌ی الان" value={faNum(r.overdueNow)} note="سفارش تحویل‌نشده که از قولش گذشته" />
      </div>

      <section className={cardCls + " p-5"}>
        <h2 className="text-sm font-bold mb-1">فروش بر اساس ماه</h2>
        <p className="text-xs text-[#6B5E4F] mb-4">جمع مبلغ سفارش‌هایی که در این بازه ثبت شدن (تومان)</p>
        <BarList rows={r.byMonth} format={faPrice} />
      </section>

      <section className={cardCls + " p-5"}>
        <h2 className="text-sm font-bold mb-1">کار انجام‌شده در هر ایستگاه</h2>
        <p className="text-xs text-[#6B5E4F] mb-4">تعداد قلم‌هایی که در این بازه مرحله‌شون تمام شد (برگشت‌خورده‌ها کم شدن)</p>
        {throughput ? (
          <BarList rows={STAGES.map((s) => ({ label: stationLabel(s), value: Math.max(0, throughput[s]) }))} format={faNum} />
        ) : (
          <div className="text-xs text-[#8A7B60]">در حال بارگذاری…</div>
        )}
      </section>
    </div>
  );
}
