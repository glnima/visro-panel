"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import CustomerInput from "./CustomerInput";
import JalaliDateInput from "./JalaliDateInput";
import { inputCls, labelCls, primaryBtn } from "./ui";
import { addDays, todayISO } from "@/lib/dates";
import { faPrice, parseDigits } from "@/lib/format";
import type { Category, Customer, Order, Product } from "@/lib/types";

type Line = {
  key: string;
  id: number | null; // existing item id when editing
  productId: number;
  productName: string;
  unitPrice: number | null;
  qty: string; // as typed; validated on submit
  fabricColor: string;
  woodColor: string;
  started: boolean; // production has begun on this item
};

export type OrderPayload = {
  customer: string;
  orderDate: string;
  requested: string;
  notes: string;
  items: { id: number | null; productId: number; qty: number; fabricColor: string; woodColor: string }[];
};

type Props = {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  orders: Order[]; // for "N previous orders" in customer suggestions
  initial?: Order;
  onSubmit: (payload: OrderPayload, ready: boolean) => Promise<boolean>;
  onError: (msg: string) => void;
};

let lineSeq = 0;

function linesFrom(order?: Order): Line[] {
  return (order?.items ?? []).map((it) => ({
    key: `i${it.id}`,
    id: it.id,
    productId: it.productId ?? 0,
    productName: it.productName,
    unitPrice: it.unitPrice,
    qty: String(it.qty),
    fabricColor: it.fabricColor,
    woodColor: it.woodColor,
    started: Object.values(it.production).some(Boolean),
  }));
}

export default function OrderForm({ products, categories, customers, orders, initial, onSubmit, onError }: Props) {
  const today = todayISO();
  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? today);
  const [requested, setRequested] = useState(initial?.requested ?? addDays(today, 14));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() => linesFrom(initial));
  const [submitting, setSubmitting] = useState(false);

  const active = products.filter((p) => p.active);
  const [pickProductId, setPickProductId] = useState(0);
  const [pickQty, setPickQty] = useState("1");
  const [pickFabric, setPickFabric] = useState("");
  const [pickWood, setPickWood] = useState("");
  const selectedId = active.some((p) => p.id === pickProductId) ? pickProductId : active[0]?.id ?? 0;

  const addLine = () => {
    const product = active.find((p) => p.id === selectedId);
    if (!product) return onError("یه مدل از لیست انتخاب کن");
    const qty = parseDigits(pickQty);
    if (!(qty >= 1 && qty <= 999)) return onError("تعداد باید بین ۱ و ۹۹۹ باشه");
    const fabricColor = pickFabric.trim();
    const woodColor = pickWood.trim();
    setLines((prev) => {
      const idx = prev.findIndex(
        (l) => l.id === null && l.productId === product.id && l.fabricColor === fabricColor && l.woodColor === woodColor
      );
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, qty: String((parseDigits(l.qty) || 0) + qty) } : l));
      return [
        ...prev,
        {
          key: `n${++lineSeq}`, id: null, productId: product.id, productName: product.name,
          unitPrice: product.price, qty: String(qty), fabricColor, woodColor, started: false,
        },
      ];
    });
    setPickQty("1");
    setPickFabric("");
    setPickWood("");
  };

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent | React.MouseEvent, ready = false) => {
    e.preventDefault();
    if (!customer.trim()) return onError("نام مشتری رو وارد کن");
    if (lines.length === 0) return onError("حداقل یه مدل به سفارش اضافه کن");
    if (requested < orderDate) return onError("تاریخ تحویل نمی‌تونه قبل از تاریخ سفارش باشه");
    const qtys = lines.map((l) => parseDigits(l.qty));
    if (qtys.some((n) => !(n >= 1 && n <= 999))) return onError("تعداد هر قلم باید بین ۱ و ۹۹۹ باشه");
    setSubmitting(true);
    const ok = await onSubmit(
      {
        customer: customer.trim(),
        orderDate,
        requested,
        notes: notes.trim(),
        items: lines.map((l, i) => ({ id: l.id, productId: l.productId, qty: qtys[i], fabricColor: l.fabricColor, woodColor: l.woodColor })),
      },
      ready
    );
    setSubmitting(false);
    if (ok && !initial) {
      setCustomer("");
      setOrderDate(todayISO());
      setRequested(addDays(todayISO(), 14));
      setNotes("");
      setLines([]);
    }
  };

  const lineQty = (l: Line) => parseDigits(l.qty) || 0;
  const total = lines.reduce((s, l) => s + lineQty(l) * (l.unitPrice ?? 0), 0);
  const byCategory = categories
    .map((c) => ({ c, list: active.filter((p) => p.categoryId === c.id) }))
    .filter((g) => g.list.length);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className={labelCls}>
        نام مشتری
        <CustomerInput value={customer} onChange={setCustomer} customers={customers} orders={orders} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className={labelCls}>
          تاریخ سفارش
          <JalaliDateInput
            value={orderDate}
            onChange={(d) => {
              setOrderDate(d);
              // keep the delivery date from landing before the order date
              if (requested < d) setRequested(d);
            }}
          />
        </label>
        <label className={labelCls}>
          تاریخ تحویل
          <JalaliDateInput value={requested} onChange={setRequested} min={orderDate} />
        </label>
      </div>

      <div className="rounded-lg bg-[#EDE6D6] p-3.5">
        <div className="text-xs text-[#6B5E4F] mb-2">افزودن مدل به این سفارش</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={labelCls + " sm:col-span-2"}>
            مدل
            <select value={selectedId} onChange={(e) => setPickProductId(Number(e.target.value))} className={inputCls}>
              {byCategory.map(({ c, list }) => (
                <optgroup key={c.id} label={c.name}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.price !== null ? ` — ${faPrice(p.price)} تومان` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            تعداد
            <input inputMode="numeric" value={pickQty} onChange={(e) => setPickQty(e.target.value)} className={inputCls + " w-24"} />
          </label>
          <div className="hidden sm:block" />
          <label className={labelCls}>
            رنگ پارچه (برای همین مدل)
            <input value={pickFabric} onChange={(e) => setPickFabric(e.target.value)} placeholder="مثلاً مخمل زرشکی" className={inputCls} />
          </label>
          <label className={labelCls}>
            رنگ / نوع چوب (برای همین مدل)
            <input value={pickWood} onChange={(e) => setPickWood(e.target.value)} placeholder="مثلاً راش تیره" className={inputCls} />
          </label>
          <button
            type="button"
            onClick={addLine}
            className="sm:col-span-2 flex items-center justify-center gap-1.5 w-full rounded-lg bg-[#9C7A3C] text-white text-sm font-medium py-2.5 px-5"
          >
            <Plus size={15} />
            افزودن به سفارش
          </button>
        </div>

        {lines.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {lines.map((l) => (
              <div key={l.key} className="flex flex-wrap items-center gap-2 bg-[#F7F2E7] rounded-lg px-3 py-2 text-sm">
                <div className="flex-1 min-w-40">
                  <div>
                    {l.productName}
                    {l.started && <span className="text-[10px] text-[#7C3AED] ms-2">در حال تولید</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <input
                      aria-label="رنگ پارچه"
                      value={l.fabricColor}
                      onChange={(e) => updateLine(l.key, { fabricColor: e.target.value })}
                      placeholder="پارچه"
                      className={inputCls + " !py-1 text-xs w-32"}
                    />
                    <input
                      aria-label="رنگ چوب"
                      value={l.woodColor}
                      onChange={(e) => updateLine(l.key, { woodColor: e.target.value })}
                      placeholder="چوب"
                      className={inputCls + " !py-1 text-xs w-32"}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-1 text-xs text-[#6B5E4F]">
                  ×
                  <input
                    aria-label="تعداد"
                    inputMode="numeric"
                    value={l.qty}
                    onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                    className={inputCls + " !py-1 w-14 text-center"}
                  />
                </label>
                {l.unitPrice !== null && (
                  <span className="text-xs text-[#6B5E4F] w-28 text-left">{faPrice(l.unitPrice * lineQty(l))} تومان</span>
                )}
                <button
                  type="button"
                  aria-label="حذف قلم"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  className="text-[#8A7B60] hover:text-[#8A3C2F]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {lines.some((l) => l.unitPrice !== null) && (
              <div className="text-xs text-[#4A2E22] font-semibold text-left px-3">جمع: {faPrice(total)} تومان</div>
            )}
          </div>
        )}
      </div>

      <label className={labelCls}>
        توضیحات بیشتر
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + " resize-none"} />
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={submitting} className={primaryBtn}>
          {initial ? <Save size={15} /> : <Plus size={15} />}
          {initial ? "ذخیره‌ی تغییرات" : "ثبت سفارش"}
        </button>
        {!initial && (
          <button
            type="button"
            disabled={submitting}
            onClick={(e) => submit(e, true)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] text-white text-sm font-medium py-2.5 px-5 disabled:opacity-60"
            title="برای اجناس آماده‌ی نمایشگاه — مراحل تولید رو رد می‌کنه و می‌ره توی «تحویل نهایی» کارگاه"
          >
            <CheckCircle2 size={15} />
            ثبت سفارش آماده
          </button>
        )}
      </div>
    </form>
  );
}
