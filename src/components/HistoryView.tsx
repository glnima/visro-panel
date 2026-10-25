"use client";

import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import JalaliDateInput from "./JalaliDateInput";
import { faDate, faTime } from "@/lib/format";
import { orderTotals } from "@/lib/production";
import type { Order } from "@/lib/types";

export default function HistoryView({ orders }: { orders: Order[] }) {
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const historyList = useMemo(() => {
    return orders
      .filter((o) => o.delivered)
      .filter((o) => {
        if (historyQuery.trim() && !o.customer.toLowerCase().includes(historyQuery.trim().toLowerCase())) {
          return false;
        }
        const d = o.deliveredAt || o.requested;
        if (historyFrom && d < historyFrom) return false;
        if (historyTo && d > historyTo) return false;
        return true;
      })
      .sort((a, b) => (b.deliveredAt || b.requested).localeCompare(a.deliveredAt || a.requested));
  }, [orders, historyQuery, historyFrom, historyTo]);

  return (
    <div>
      <h1 className="text-lg font-bold mb-1 flex items-center gap-2">
        <History size={18} />
        تاریخچه تحویل
      </h1>
      <p className="text-sm text-[#6B5E4F] mb-4">همه‌ی سفارش‌هایی که تا امروز تحویل داده شده‌اند</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <label className="flex-1 flex items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
          <Search size={15} className="text-[#8A7B60]" />
          <input
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
            placeholder="جستجوی نام مشتری"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          از
          <JalaliDateInput value={historyFrom} onChange={setHistoryFrom} />
          {historyFrom && (
            <button type="button" onClick={() => setHistoryFrom("")} className="text-[#8A7B60] hover:text-[#8A3C2F]">
              ×
            </button>
          )}
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          تا
          <JalaliDateInput value={historyTo} onChange={setHistoryTo} />
          {historyTo && (
            <button type="button" onClick={() => setHistoryTo("")} className="text-[#8A7B60] hover:text-[#8A3C2F]">
              ×
            </button>
          )}
        </label>
      </div>

      <div className="rounded-xl border border-[#D9CDB6] overflow-hidden bg-[#F7F2E7]">
        {historyList.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[#8A7B60]">
            سفارش تحویل‌شده‌ای با این فیلتر پیدا نشد
          </div>
        )}
        {historyList.map((o) => {
          const totals = orderTotals(o);
          return (
            <div key={o.id} className="px-4 py-3 border-b border-[#E4DCC8] last:border-0">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <span className="text-sm font-medium">{o.customer}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-[#2563EB] text-white">
                  تحویل: {o.deliveredAt ? faDate(o.deliveredAt) : "نامشخص"}
                </span>
              </div>
              <div className="text-xs text-[#6B5E4F]">
                {o.id} — {totals.summary} · ثبت سفارش: {faDate(o.createdAt)}
                {o.registeredAt && ` — ساعت ${faTime(o.registeredAt)}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
