"use client";

import { useState, type FormEvent } from "react";
import { Package, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "./Toast";
import { Empty, Modal, PageTitle, cardCls, inputCls, labelCls, linkBtn, primaryBtn } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { faNum, faPrice, parseDigits } from "@/lib/format";
import { MAX_PRODUCTS, type Bootstrap, type Product } from "@/lib/types";

type Draft = { id: number | null; name: string; categoryId: number; price: string };

function PriceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = parseDigits(value);
  return (
    <label className={labelCls}>
      قیمت (تومان)
      <input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder="۰" className={inputCls + " w-40"} />
      <span className="text-[11px] text-[#8A7B60] h-4">{value && (Number.isFinite(n) ? `${faPrice(n)} تومان` : "فقط عدد بنویس")}</span>
    </label>
  );
}

export default function ProductsView({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const toast = useToast();
  const firstCategory = data.categories[0]?.id ?? 0;
  const [form, setForm] = useState<Draft>({ id: null, name: "", categoryId: firstCategory, price: "" });
  const [editing, setEditing] = useState<Draft | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const active = data.products.filter((p) => p.active);
  const visible = data.products.filter((p) => p.active || showInactive);
  const categoryName = (id: number) => data.categories.find((c) => c.id === id)?.name ?? "—";

  const payload = (d: Draft) => {
    const price = parseDigits(d.price);
    if (!d.name.trim()) throw new Error("نام محصول رو وارد کن");
    if (!Number.isFinite(price)) throw new Error("قیمت رو به عدد (تومان) وارد کن");
    return { name: d.name.trim(), categoryId: d.categoryId || firstCategory, price };
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("POST", "/api/products", payload(form));
      await refresh();
      toast.ok(`محصول «${form.name.trim()}» اضافه شد`);
      setForm({ id: null, name: "", categoryId: form.categoryId, price: "" });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api("PATCH", `/api/products/${editing.id}`, payload(editing));
      await refresh();
      toast.ok("محصول ذخیره شد");
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const setActive = async (p: Product, value: boolean, withUndo = true) => {
    try {
      await api("PATCH", `/api/products/${p.id}`, { active: value });
      await refresh();
      toast.ok(
        value ? `«${p.name}» برگشت به لیست` : `«${p.name}» از لیست حذف شد`,
        withUndo ? { label: "واگرد", run: () => setActive(p, !value, false) } : undefined
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = (p: Product) => {
    if (confirmId !== p.id) {
      setConfirmId(p.id);
      window.setTimeout(() => setConfirmId((id) => (id === p.id ? null : id)), 3000);
      return;
    }
    setConfirmId(null);
    setActive(p, false);
  };

  const categorySelect = (d: Draft, set: (d: Draft) => void) => (
    <label className={labelCls}>
      دسته
      <select value={d.categoryId} onChange={(e) => set({ ...d, categoryId: Number(e.target.value) })} className={inputCls}>
        {data.categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <section className={cardCls + " p-5 shadow-sm"}>
        <h2 className="text-sm font-bold mb-4">افزودن مدل جدید</h2>
        <form onSubmit={add} className="flex flex-col sm:flex-row gap-3.5 items-stretch sm:items-start">
          <label className={labelCls + " flex-1"}>
            نام مدل
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً میز عسلی گرد" className={inputCls} />
          </label>
          {categorySelect(form, setForm)}
          <PriceInput value={form.price} onChange={(price) => setForm({ ...form, price })} />
          <button type="submit" disabled={active.length >= MAX_PRODUCTS} className={primaryBtn + " sm:mt-5 whitespace-nowrap"}>
            <Plus size={15} />
            افزودن
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageTitle
            icon={<Package size={18} />}
            title={`مدل‌ها (${faNum(active.length)} از ${faNum(MAX_PRODUCTS)})`}
            subtitle="حذف یه مدل روی سفارش‌های قبلی اثری نداره — اسم و قیمت موقع ثبت سفارش ذخیره شده"
          />
          <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            نمایش حذف‌شده‌ها
          </label>
        </div>
        <div className={cardCls + " overflow-hidden"}>
          {visible.length === 0 && <Empty>هنوز مدلی اضافه نشده</Empty>}
          {visible.map((p) => (
            <div
              key={p.id}
              className={"px-4 py-3 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap " + (p.active ? "" : "opacity-60")}
            >
              <div>
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs text-[#6B5E4F]"> · {categoryName(p.categoryId)}</span>
                {!p.active && <span className="text-xs text-[#8A3C2F]"> · حذف‌شده</span>}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-[#4A2E22] font-medium">{faPrice(p.price ?? 0)} تومان</span>
                {p.active ? (
                  <>
                    <button
                      onClick={() => setEditing({ id: p.id, name: p.name, categoryId: p.categoryId, price: String(p.price ?? 0) })}
                      className={linkBtn}
                    >
                      <Pencil size={13} />
                      ویرایش
                    </button>
                    <button
                      onClick={() => remove(p)}
                      title={confirmId === p.id ? "برای حذف دوباره بزن" : "حذف مدل"}
                      className={"flex items-center gap-1 " + (confirmId === p.id ? "text-[#8A3C2F] font-semibold" : "text-[#8A7B60] hover:text-[#8A3C2F]")}
                    >
                      <Trash2 size={14} />
                      {confirmId === p.id && <span className="text-[10px]">دوباره بزن</span>}
                    </button>
                  </>
                ) : (
                  <button onClick={() => setActive(p, true)} className={linkBtn}>
                    <RotateCcw size={13} />
                    برگردون
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <Modal title="ویرایش مدل" onClose={() => setEditing(null)}>
          <form onSubmit={save} className="flex flex-col gap-3">
            <label className={labelCls}>
              نام مدل
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
            </label>
            {categorySelect(editing, setEditing)}
            <PriceInput value={editing.price} onChange={(price) => setEditing({ ...editing, price })} />
            <p className="text-[11px] text-[#8A7B60]">قیمت جدید فقط روی سفارش‌های بعدی اثر داره.</p>
            <button type="submit" className={primaryBtn + " self-start"}>
              ذخیره
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
