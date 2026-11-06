"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ClipboardCheck, History, Minus, PackagePlus, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";
import { useToast } from "./Toast";
import { Empty, Modal, PageTitle, cardCls, inputCls, labelCls, linkBtn, primaryBtn, secondaryBtn } from "./ui";
import { STOCK_LEVEL_LABELS, stockLevel, type StockLevel } from "@/lib/accounting";
import { api, errorMessage } from "@/lib/api";
import { localDate } from "@/lib/dates";
import { faDate, faNum, faTime } from "@/lib/format";
import { canEditMaterials, type Bootstrap, type CatalogOption, type Material, type OptionKind, type StockMovement } from "@/lib/types";

type Props = { data: Bootstrap; refresh: () => Promise<void> };
type Tab = "materials" | "ready" | "lists";

const LEVEL_CLS: Record<StockLevel, string> = {
  ok: "bg-[#DCFCE7] text-[#166534]",
  low: "bg-[#FEF3C7] text-[#92400E]",
  short: "bg-[#FEE2E2] text-[#991B1B]",
};

const toNumber = (s: string) => Number(s.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace("٫", ".").trim());

export default function InventoryView({ data, refresh }: Props) {
  const [tab, setTab] = useState<Tab>("materials");
  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      aria-pressed={tab === t}
      className={"rounded-md px-3 py-1.5 text-sm " + (tab === t ? "bg-[#FBF8F1] font-semibold shadow-sm" : "text-[#6B5E4F]")}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageTitle icon={<Warehouse size={18} />} title="انبار" subtitle="مواد اولیه، مدل‌های آماده توی فروشگاه، و لیست پارچه و چوب" />
      <div className="flex w-max max-w-full overflow-x-auto rounded-lg bg-[#E4DCC8] p-1 gap-0.5">
        {tabBtn("materials", "مواد اولیه")}
        {tabBtn("ready", "آماده در فروشگاه")}
        {tabBtn("lists", "پارچه و چوب")}
      </div>
      {tab === "materials" && <Materials data={data} refresh={refresh} />}
      {tab === "ready" && <ReadyStock data={data} refresh={refresh} />}
      {tab === "lists" && (
        <div className="grid gap-4 md:grid-cols-2">
          <OptionList kind="fabric" title="پارچه" placeholder="مثلاً مخمل زرشکی" options={data.options} refresh={refresh} />
          <OptionList kind="wood" title="چوب" placeholder="مثلاً راش تیره" options={data.options} refresh={refresh} />
        </div>
      )}
    </div>
  );
}

// ---- raw materials ----

type Dialog = { kind: "new" } | { kind: "edit" | "receive" | "count" | "history"; material: Material };

function Materials({ data, refresh }: Props) {
  const editable = canEditMaterials(data.me.role);
  const [query, setQuery] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const active = data.materials.filter((m) => m.active);
  const attention = active.filter((m) => stockLevel(m) !== "ok");
  const list = useMemo(() => {
    const q = query.trim();
    const rank: Record<StockLevel, number> = { short: 0, low: 1, ok: 2 };
    return active
      .filter((m) => !q || m.name.includes(q))
      .filter((m) => !onlyLow || stockLevel(m) !== "ok")
      .sort((a, b) => rank[stockLevel(a)] - rank[stockLevel(b)] || a.name.localeCompare(b.name, "fa"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.materials, query, onlyLow]);
  const usedIn = (m: Material) => data.products.filter((p) => p.active && p.bom.some((b) => b.materialId === m.id)).length;

  return (
    <>
      {attention.length > 0 && (
        <button onClick={() => setOnlyLow((v) => !v)} className="flex items-center gap-2 rounded-lg bg-[#FEF3C7] border border-[#FCD34D] px-4 py-2 text-right text-sm text-[#78350F]">
          <AlertTriangle size={16} className="shrink-0" />
          {faNum(attention.length)} ماده رو به اتمام یا کسری داره
          <span className="underline text-xs">{onlyLow ? "نمایش همه" : "فقط همین‌ها"}</span>
        </button>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
          <Search size={15} className="text-[#8A7B60]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی ماده" className="flex-1 min-w-0 bg-transparent text-sm outline-none" />
        </label>
        {editable && (
          <button onClick={() => setDialog({ kind: "new" })} className={primaryBtn}>
            <Plus size={15} />
            ماده‌ی جدید
          </button>
        )}
      </div>

      <div className={cardCls + " overflow-hidden"}>
        {list.length === 0 && <Empty>{active.length ? "چیزی پیدا نشد" : "هنوز ماده‌ای تعریف نشده"}</Empty>}
        {list.map((m) => {
          const level = stockLevel(m);
          return (
            <div key={m.id} className="px-4 py-3 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + LEVEL_CLS[level]}>{STOCK_LEVEL_LABELS[level]}</span>
                </div>
                <div className="text-[11px] text-[#8A7B60] mt-0.5">
                  حداقل {faNum(m.minStock)} {m.unit}، توی {faNum(usedIn(m))} مدل استفاده می‌شه
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className={"text-base font-bold tabular-nums " + (m.stock < 0 ? "text-[#991B1B]" : "")}>
                  {faNum(m.stock)} <span className="text-xs font-normal text-[#6B5E4F]">{m.unit}</span>
                </span>
                {editable && (
                  <>
                    <button onClick={() => setDialog({ kind: "receive", material: m })} className={linkBtn}>
                      <PackagePlus size={13} />
                      ورود کالا
                    </button>
                    <button onClick={() => setDialog({ kind: "count", material: m })} className={linkBtn}>
                      <ClipboardCheck size={13} />
                      شمارش
                    </button>
                    <button onClick={() => setDialog({ kind: "edit", material: m })} className={linkBtn}>
                      <Pencil size={13} />
                      ویرایش
                    </button>
                  </>
                )}
                <button onClick={() => setDialog({ kind: "history", material: m })} className={linkBtn}>
                  <History size={13} />
                  گردش
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {dialog?.kind === "new" && <MaterialForm refresh={refresh} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <MaterialForm material={dialog.material} refresh={refresh} onClose={() => setDialog(null)} />}
      {(dialog?.kind === "receive" || dialog?.kind === "count") && (
        <StockForm mode={dialog.kind} material={dialog.material} refresh={refresh} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "history" && <MovementHistory material={dialog.material} version={data.version} onClose={() => setDialog(null)} />}
    </>
  );
}

function MaterialForm({ material, refresh, onClose }: { material?: Material; refresh: () => Promise<void>; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(material?.name ?? "");
  const [unit, setUnit] = useState(material?.unit ?? "عدد");
  const [stock, setStock] = useState("");
  const [minStock, setMinStock] = useState(material ? String(material.minStock) : "");

  const submit = async (e: FormEvent, active = true) => {
    e.preventDefault();
    try {
      const min = minStock.trim() ? toNumber(minStock) : 0;
      if (!Number.isFinite(min) || min < 0) throw new Error("حداقل موجودی باید عدد باشه");
      if (material) {
        await api("PATCH", `/api/materials/${material.id}`, { name, unit, minStock: min, active });
      } else {
        const initial = stock.trim() ? toNumber(stock) : 0;
        if (!Number.isFinite(initial) || initial < 0) throw new Error("موجودی باید عدد باشه");
        await api("POST", "/api/materials", { name, unit, stock: initial, minStock: min });
      }
      await refresh();
      toast.ok(active ? "ذخیره شد" : "از لیست انبار برداشته شد");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal title={material ? `ویرایش ${material.name}` : "ماده‌ی جدید"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className={labelCls}>
          نام
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً میخ، فوم، پارچه مخمل" className={inputCls} />
        </label>
        <label className={labelCls}>
          واحد
          <input value={unit} onChange={(e) => setUnit(e.target.value)} list="mizan-units" className={inputCls} />
          <datalist id="mizan-units">
            {["عدد", "متر", "کیلو", "لیتر", "ورق", "بسته"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        {!material && (
          <label className={labelCls}>
            موجودی فعلی
            <input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="۰" className={inputCls} />
          </label>
        )}
        <label className={labelCls}>
          حداقل موجودی (از این کمتر بشه هشدار می‌ده)
          <input inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="۰" className={inputCls} />
        </label>
        <div className="flex items-center justify-between gap-2">
          <button type="submit" className={primaryBtn}>ذخیره</button>
          {material && (
            <button type="button" onClick={(e) => submit(e, false)} className={linkBtn}>
              <Trash2 size={13} />
              برداشتن از لیست
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function StockForm({ mode, material, refresh, onClose }: { mode: "receive" | "count"; material: Material; refresh: () => Promise<void>; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = toNumber(value);
    if (!Number.isFinite(n) || n < 0 || !value.trim()) return toast.error("مقدار رو به عدد وارد کن");
    try {
      await api("POST", `/api/materials/${material.id}/stock`, mode === "receive" ? { kind: "purchase", qty: n, note } : { kind: "adjust", setTo: n, note });
      await refresh();
      toast.ok(`موجودی ${material.name} به‌روز شد`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal title={mode === "receive" ? `ورود کالا: ${material.name}` : `شمارش انبار: ${material.name}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-xs text-[#6B5E4F]">
          موجودی سیستم: {faNum(material.stock)} {material.unit}
        </p>
        <label className={labelCls}>
          {mode === "receive" ? `مقدار خریداری‌شده (${material.unit})` : `موجودی واقعی که شمردی (${material.unit})`}
          <input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          توضیح (اختیاری)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "receive" ? "مثلاً نام فروشنده" : "مثلاً شمارش آخر ماه"} className={inputCls} />
        </label>
        <button type="submit" className={primaryBtn + " self-start"}>ثبت</button>
      </form>
    </Modal>
  );
}

const MOVE_LABELS: Record<StockMovement["kind"], string> = {
  purchase: "خرید / ورود",
  adjust: "اصلاح شمارش",
  consume: "مصرف سفارش",
  release: "برگشت از سفارش",
};

function MovementHistory({ material, version, onClose }: { material: Material; version: number; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<StockMovement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ movements: StockMovement[] }>("GET", `/api/materials/${material.id}/movements`)
      .then((r) => !cancelled && setRows(r.movements))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [material.id, version, toast]);

  return (
    <Modal title={`گردش ${material.name}`} onClose={onClose}>
      {rows === null && <Empty>در حال بارگذاری…</Empty>}
      {rows?.length === 0 && <Empty>هنوز گردشی ثبت نشده</Empty>}
      <ul className="flex flex-col gap-1.5">
        {rows?.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#E4DCC8] px-3 py-2 text-xs">
            <span>
              <b>{MOVE_LABELS[m.kind]}</b>
              {m.orderCode && ` — ${m.orderCode}`}
              {m.note && ` — ${m.note}`}
              <span className="block text-[#8A7B60] mt-0.5">
                {m.user ?? "—"}، {faDate(localDate(m.at))} — {faTime(m.at)}
              </span>
            </span>
            <span dir="ltr" className={"text-sm font-bold tabular-nums " + (m.delta < 0 ? "text-[#991B1B]" : "text-[#166534]")}>
              {m.delta > 0 ? "+" : "−"}
              {faNum(Math.abs(m.delta))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// ---- finished pieces in the shop ----

function ReadyStock({ data, refresh }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const list = data.products
    .filter((p) => p.active && (!q || p.name.includes(q)))
    .sort((a, b) => b.readyStock - a.readyStock || a.name.localeCompare(b.name, "fa"));

  const change = async (id: number, delta: number) => {
    try {
      await api("POST", `/api/products/${id}/ready`, { delta });
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <p className="text-xs text-[#6B5E4F]">
        مدل‌هایی که ساخته شده و توی فروشگاه موجودن. با «فروش از فروشگاه» توی فرم سفارش، بدون رفتن به کارگاه فروخته می‌شن و از این تعداد کم می‌شه.
      </p>
      <label className="flex items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
        <Search size={15} className="text-[#8A7B60]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی مدل" className="flex-1 min-w-0 bg-transparent text-sm outline-none" />
      </label>
      <div className={cardCls + " overflow-hidden"}>
        {list.length === 0 && <Empty>مدلی پیدا نشد</Empty>}
        {list.map((p) => (
          <div key={p.id} className="px-4 py-3 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3">
            <span className="text-sm font-medium min-w-0 truncate">{p.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button aria-label={`یکی کم از ${p.name}`} disabled={p.readyStock === 0} onClick={() => change(p.id, -1)} className={secondaryBtn + " !p-2"}>
                <Minus size={14} />
              </button>
              <span className="w-10 text-center text-base font-bold tabular-nums">{faNum(p.readyStock)}</span>
              <button aria-label={`یکی اضافه به ${p.name}`} onClick={() => change(p.id, 1)} className={secondaryBtn + " !p-2"}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---- fabric and wood pick-lists ----

function OptionList({ kind, title, placeholder, options, refresh }: { kind: OptionKind; title: string; placeholder: string; options: CatalogOption[]; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<CatalogOption | null>(null);
  const list = options.filter((o) => o.kind === kind && o.active);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await refresh();
      toast.ok(ok);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  return (
    <section className={cardCls + " p-4"}>
      <h2 className="text-sm font-bold mb-1">{title} ({faNum(list.length)})</h2>
      <p className="text-[11px] text-[#8A7B60] mb-3">توی فرم سفارش از همین لیست انتخاب می‌شه. سفارش‌های قبلی با حذف از این لیست عوض نمی‌شن.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {list.length === 0 && <span className="text-xs text-[#8A7B60]">لیست خالیه</span>}
        {list.map((o) => (
          <span key={o.id} className="flex items-center gap-1.5 rounded-full border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-1 text-sm">
            <button onClick={() => setRenaming({ ...o })} title="تغییر نام">{o.name}</button>
            <button
              aria-label={`حذف ${o.name}`}
              onClick={() => run(() => api("PATCH", `/api/options/${o.id}`, { active: false }), `«${o.name}» از لیست حذف شد`)}
              className="text-[#8A7B60] hover:text-[#8A3C2F]"
            >
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api("POST", "/api/options", { kind, name }), `«${name.trim()}» اضافه شد`)) setName("");
        }}
        className="flex gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className={inputCls + " flex-1 min-w-0"} />
        <button type="submit" className={secondaryBtn}>
          <Plus size={14} />
          افزودن
        </button>
      </form>
      {renaming && (
        <Modal title="تغییر نام" onClose={() => setRenaming(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("PATCH", `/api/options/${renaming.id}`, { name: renaming.name }), "ذخیره شد")) setRenaming(null);
            }}
            className="flex flex-col gap-3"
          >
            <input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className={inputCls} />
            <button type="submit" className={primaryBtn + " self-start"}>ذخیره</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
