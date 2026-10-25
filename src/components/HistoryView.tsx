"use client";

import { useMemo, useState } from "react";
import { History, Printer, Search, Undo2 } from "lucide-react";
import JalaliDateInput from "./JalaliDateInput";
import { useToast } from "./Toast";
import { Empty, PageTitle, cardCls, linkBtn } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { faDate, faNum, faPrice, faTime } from "@/lib/format";
import { orderTotals, statusOf } from "@/lib/production";
import type { Bootstrap, Order } from "@/lib/types";

export default function HistoryView({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const showPrices = data.me.role !== "workshop";
  const today = todayISO();

  const list = useMemo(() => {
    const q = query.trim();
    return data.orders
      .filter((o): o is Order & { deliveredAt: string } => o.deliveredAt !== null)
      .filter((o) => !q || o.customer.includes(q) || o.code.toLowerCase().includes(q.toLowerCase()))
      .filter((o) => (!from || o.deliveredAt >= from) && (!to || o.deliveredAt <= to))
      .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt) || b.id - a.id);
  }, [data.orders, query, from, to]);

  const undeliver = async (o: Order) => {
    if (confirmId !== o.id) {
      setConfirmId(o.id);
      window.setTimeout(() => setConfirmId((id) => (id === o.id ? null : id)), 3000);
      return;
    }
    setConfirmId(null);
    try {
      await api("POST", `/api/orders/${o.id}/deliver`, { delivered: false });
      await refresh();
      toast.ok(`سفارش ${o.code} به «تحویل نهایی» کارگاه برگشت`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const total = list.reduce((s, o) => s + orderTotals(o).price, 0);

  return (
    <div>
      <PageTitle icon={<History size={18} />} title="تاریخچه تحویل" subtitle="همه‌ی سفارش‌هایی که تا امروز تحویل داده شده‌اند" />

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <label className="flex-1 flex items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
          <Search size={15} className="text-[#8A7B60]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی مشتری یا شماره سفارش"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          از
          <JalaliDateInput value={from} onChange={setFrom} emptyLabel="هر تاریخی" />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          تا
          <JalaliDateInput value={to} onChange={setTo} emptyLabel="هر تاریخی" />
        </label>
      </div>

      <div className="text-xs text-[#6B5E4F] mb-2">
        {faNum(list.length)} سفارش{showPrices && ` · جمع ${faPrice(total)} تومان`}
      </div>

      <div className={cardCls + " overflow-hidden"}>
        {list.length === 0 && <Empty>سفارش تحویل‌شده‌ای با این فیلتر پیدا نشد</Empty>}
        {list.map((o) => {
          const totals = orderTotals(o);
          const st = statusOf(o, today);
          return (
            <div key={o.id} className="px-4 py-3 border-b border-[#E4DCC8] last:border-0">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <span className="text-sm font-medium">{o.customer}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-[#2563EB] text-white">
                  تحویل: {faDate(o.deliveredAt)}
                  {st.text !== "تحویل شده" && ` — ${st.text.replace("تحویل شده ", "")}`}
                </span>
              </div>
              <div className="text-xs text-[#6B5E4F]">
                {o.code} — {totals.summary}
                {showPrices && ` · ${faPrice(totals.price)} تومان`}
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 flex-wrap text-xs text-[#6B5E4F]">
                <span>
                  ثبت سفارش: {faDate(o.orderDate)} — ساعت {faTime(o.registeredAt)} · قول تحویل: {faDate(o.requested)}
                </span>
                <div className="flex items-center gap-4">
                  <a href={`/print/${o.code}`} target="_blank" rel="noreferrer" className={linkBtn}>
                    <Printer size={13} />
                    چاپ
                  </a>
                  {showPrices && (
                    <button onClick={() => undeliver(o)} className={linkBtn + (confirmId === o.id ? " font-semibold text-[#8A3C2F]" : "")}>
                      <Undo2 size={13} />
                      {confirmId === o.id ? "برای تأیید دوباره بزن" : "برگشت از تحویل"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
