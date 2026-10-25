"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ChevronDown, Pencil, Plus, Search, Users } from "lucide-react";
import { useToast } from "./Toast";
import { Empty, Modal, PageTitle, cardCls, inputCls, labelCls, linkBtn, primaryBtn } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { faDate, faNum, faPrice } from "@/lib/format";
import { orderTotals, statusOf, toneColor } from "@/lib/production";
import type { Bootstrap, Customer } from "@/lib/types";

type Draft = { id: number | null; name: string; phone: string; notes: string };

export default function CustomersView({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const today = todayISO();

  const rows = useMemo(() => {
    const q = query.trim();
    return data.customers
      .filter((c) => !q || c.name.includes(q) || c.phone.includes(q))
      .map((c) => {
        const orders = data.orders.filter((o) => o.customerId === c.id).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
        return { c, orders, total: orders.reduce((s, o) => s + orderTotals(o).price, 0), last: orders[0]?.orderDate };
      })
      .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? "") || a.c.name.localeCompare(b.c.name, "fa"));
  }, [data.customers, data.orders, query]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    try {
      const body = { name: draft.name, phone: draft.phone, notes: draft.notes };
      if (draft.id === null) await api("POST", "/api/customers", body);
      else await api("PATCH", `/api/customers/${draft.id}`, body);
      await refresh();
      toast.ok(draft.id === null ? "مشتری اضافه شد" : "مشتری ذخیره شد");
      setDraft(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const edit = (c: Customer) => setDraft({ id: c.id, name: c.name, phone: c.phone, notes: c.notes });

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageTitle icon={<Users size={18} />} title={`مشتری‌ها (${faNum(data.customers.length)})`} subtitle="هر مشتری با سابقه‌ی سفارش‌هاش — با ثبت سفارش برای اسم جدید، مشتری خودکار ساخته می‌شه" />
        <button onClick={() => setDraft({ id: null, name: "", phone: "", notes: "" })} className={primaryBtn}>
          <Plus size={15} />
          مشتری جدید
        </button>
      </div>

      <label className="mb-3 flex items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
        <Search size={15} className="text-[#8A7B60]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی نام یا تلفن" className="flex-1 bg-transparent text-sm outline-none" />
      </label>

      <div className={cardCls + " overflow-hidden"}>
        {rows.length === 0 && <Empty>مشتری‌ای پیدا نشد</Empty>}
        {rows.map(({ c, orders, total, last }) => (
          <div key={c.id} className="border-b border-[#E4DCC8] last:border-0">
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="flex items-center gap-2 text-right">
                <ChevronDown size={16} className={"text-[#8A7B60] transition-transform " + (open === c.id ? "rotate-180" : "")} />
                <span>
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.phone && <span className="text-xs text-[#6B5E4F]"> · {c.phone}</span>}
                </span>
              </button>
              <div className="flex items-center gap-4 text-xs text-[#6B5E4F]">
                <span>{faNum(orders.length)} سفارش</span>
                <span>{faPrice(total)} تومان</span>
                {last && <span>آخرین: {faDate(last)}</span>}
                <button onClick={() => edit(c)} className={linkBtn}>
                  <Pencil size={13} />
                  ویرایش
                </button>
              </div>
            </div>
            {open === c.id && (
              <div className="px-4 pb-3">
                {c.notes && <div className="text-xs text-[#8A7B60] mb-2">{c.notes}</div>}
                {orders.length === 0 && <div className="text-xs text-[#8A7B60]">هنوز سفارشی نداره</div>}
                <div className="flex flex-col gap-1">
                  {orders.map((o) => {
                    const st = statusOf(o, today);
                    const t = orderTotals(o);
                    return (
                      <div key={o.id} className="flex items-center justify-between gap-2 flex-wrap rounded-lg bg-[#EDE6D6] px-3 py-2 text-xs">
                        <span>
                          {o.code} · {faDate(o.orderDate)} — {t.summary}
                        </span>
                        <span className="flex items-center gap-3">
                          <span>{faPrice(t.price)} تومان</span>
                          <span style={{ backgroundColor: toneColor[st.tone] }} className="rounded-full px-2 py-0.5 text-white">
                            {st.text}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {draft && (
        <Modal title={draft.id === null ? "مشتری جدید" : "ویرایش مشتری"} onClose={() => setDraft(null)}>
          <form onSubmit={save} className="flex flex-col gap-3">
            <label className={labelCls}>
              نام
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
            </label>
            <label className={labelCls}>
              تلفن
              <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} inputMode="tel" className={inputCls} />
            </label>
            <label className={labelCls}>
              توضیحات
              <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls + " resize-none"} />
            </label>
            <button type="submit" className={primaryBtn + " self-start"}>
              ذخیره
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
