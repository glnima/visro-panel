"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import StoreView, { type OrderDraft } from "./StoreView";
import WorkshopView from "./WorkshopView";
import ProductsView from "./ProductsView";
import HistoryView from "./HistoryView";
import { daysAgo, daysFromNow } from "@/lib/format";
import { STATIONS, emptyProduction, fullProduction, groupByStation, nextStepMessage } from "@/lib/production";
import { sanitizeOrders, sanitizeProducts } from "@/lib/sanitize";
import { seedOrders, seedProducts } from "@/lib/seed";
import { PRODUCTS_KEY, STORAGE_KEY } from "@/lib/storage";
import type { Category, Order, Product, StageKey } from "@/lib/types";
import { useSharedList } from "@/lib/useSharedList";
import { useTimedValue } from "@/lib/useTimedValue";

type View = "store" | "workshop" | "products" | "history";

const TABS: [View, string][] = [
  ["store", "فروشگاه"],
  ["workshop", "کارگاه تولید"],
  ["products", "محصولات"],
  ["history", "تاریخچه"],
];

const getSeedProducts = () => seedProducts;

// NOTE: IDs are computed in the browser, so two people can create the same one.
// Kept as in the prototype; moved to the server in Phase 2.
function nextId(prefix: string, ids: string[], fallbackBase: number): string {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const nums = ids
    .map((id) => {
      const m = re.exec(id || "");
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter((n) => Number.isFinite(n));
  const base = nums.length ? Math.max(...nums) : fallbackBase;
  return `${prefix}${base + 1}`;
}

export default function MizanApp() {
  const [view, setView] = useState<View>("store");

  const ordersStore = useSharedList<Order>(STORAGE_KEY, seedOrders, sanitizeOrders);
  const productsStore = useSharedList<Product>(PRODUCTS_KEY, getSeedProducts, sanitizeProducts);
  const orders = ordersStore.items;
  const products = productsStore.items;
  const saveOrders = ordersStore.save;
  const saveProducts = productsStore.save;
  const syncError = ordersStore.syncError || productsStore.syncError;

  const [toast, showToast] = useTimedValue("", 2600);
  const [errorMsg, showError] = useTimedValue("", 3500);
  const [highlightId, flash] = useTimedValue<string | null>(null, 2200);
  const [confirmDeleteId, armDeleteOrder, disarmDeleteOrder] = useTimedValue<string | null>(null, 3000);
  const [confirmDeleteProductId, armDeleteProduct, disarmDeleteProduct] = useTimedValue<string | null>(null, 3000);
  const [resetArmed, armReset, disarmReset] = useTimedValue(false, 3000);

  // ---- order actions ----
  const createOrder = (draft: OrderDraft, ready: boolean): boolean => {
    try {
      if (ordersStore.loading) return false;
      const customerName = (draft.customer || "").trim();
      if (!customerName) {
        showError("نام مشتری رو وارد کن");
        return false;
      }
      if (draft.items.length === 0) {
        showError("حداقل یه مدل به سفارش اضافه کن");
        return false;
      }
      const id = nextId("SF-", orders.map((o) => o.id), 2000);
      const newOrder: Order = {
        id,
        customer: customerName,
        items: draft.items,
        requested: draft.requested || daysFromNow(14),
        createdAt: draft.orderDate || daysAgo(0),
        registeredAt: new Date().toISOString(),
        production: ready ? fullProduction() : emptyProduction(),
        delivered: false,
        deliveredAt: null,
        notes: (draft.notes || "").trim(),
      };
      saveOrders((prev) => [newOrder, ...prev]);
      showToast(
        ready
          ? `سفارش ${id} به‌عنوان آماده ثبت شد و توی «تحویل نهایی» کارگاه منتظره`
          : `سفارش ${id} ثبت شد و به کارگاه ارسال شد`
      );
      flash(id);
      return true;
    } catch {
      showError("ثبت سفارش با خطا مواجه شد — دوباره امتحان کن");
      return false;
    }
  };

  const advanceProduction = (id: string, key: StageKey) => {
    try {
      const stationLabel = STATIONS.find((s) => s.key === key)?.label || key;
      let nextMsg = "";
      saveOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const updated = { ...o, production: { ...o.production, [key]: true } };
          nextMsg = nextStepMessage(updated.production);
          return updated;
        })
      );
      showToast(`${stationLabel} سفارش ${id} تمام شد${nextMsg ? " — " + nextMsg : ""}`);
      flash(id);
    } catch {
      showError("ثبت مرحله با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const deliver = (id: string) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      saveOrders((prev) => prev.map((o) => (o.id === id ? { ...o, delivered: true, deliveredAt: today } : o)));
      showToast(`سفارش ${id} تحویل داده شد`);
    } catch {
      showError("ثبت تحویل با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const deleteOrder = (id: string) => {
    if (confirmDeleteId !== id) {
      armDeleteOrder(id);
      return;
    }
    disarmDeleteOrder();
    try {
      saveOrders((prev) => prev.filter((o) => o.id !== id));
      showToast(`سفارش ${id} حذف شد`);
    } catch {
      showError("حذف سفارش با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const jumpToOrder = (id: string) => {
    setView("workshop");
    flash(id);
  };

  const resetDemoData = () => {
    if (!resetArmed) {
      armReset(true);
      return;
    }
    disarmReset();
    saveOrders(seedOrders());
    saveProducts(seedProducts);
    showToast("داده‌ها به حالت نمونه بازنشانی شد");
  };

  // ---- product catalog actions ----
  const addProduct = (name: string, category: Category, price: number): boolean => {
    if (!name) {
      showError("نام محصول رو وارد کن");
      return false;
    }
    try {
      const id = nextId("P", products.map((p) => p.id), 100);
      saveProducts((prev) => [...prev, { id, name, category, price }]);
      showToast(`محصول «${name}» اضافه شد`);
      return true;
    } catch {
      showError("افزودن محصول با خطا مواجه شد — دوباره امتحان کن");
      return false;
    }
  };

  const deleteProduct = (id: string) => {
    if (confirmDeleteProductId !== id) {
      armDeleteProduct(id);
      return;
    }
    disarmDeleteProduct();
    try {
      saveProducts((prev) => prev.filter((p) => p.id !== id));
      showToast("محصول حذف شد");
    } catch {
      showError("حذف محصول با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  // ---- derived data ----
  const ledger = useMemo(() => {
    return [...orders].sort((a, b) => {
      if (a.delivered !== b.delivered) return a.delivered ? 1 : -1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [orders]);

  const stationOrders = useMemo(() => groupByStation(orders), [orders]);

  const loading = ordersStore.loading || productsStore.loading;

  return (
    <div className="min-h-screen w-full bg-[#EDE6D6] text-[#2B2420]">
      {/* Header */}
      <header className="bg-[#3B241A] text-[#F3EEE1]">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xl font-bold tracking-tight">میزان</div>
            <div className="text-xs text-[#C9B79E] mt-0.5">هماهنگی فروش و تولید مبل — نسخه v43</div>
          </div>
          <nav className="flex flex-wrap rounded-lg bg-[#2C1B13] p-1 gap-0.5">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={
                  "px-3.5 py-1.5 text-sm rounded-md transition-colors " +
                  (view === key ? "bg-[#9C7A3C] text-[#2B2420] font-semibold" : "text-[#D9CDB6]")
                }
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5">
        <div className="mt-4 text-xs text-[#6B5E4F] bg-[#E4DCC8] border border-[#D9CDB6] rounded-lg px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span>این اطلاعات بین هر کسی که این لینک رو داشته باشه مشترکه و زنده همگام می‌شه — فعلاً بدون ورود جدا برای هر نفر.</span>
          <button
            onClick={resetDemoData}
            className={
              "shrink-0 text-xs px-2.5 py-1 rounded-md border transition-colors " +
              (resetArmed
                ? "border-[#E3B6AC] bg-[#F3DFDA] text-[#8A3C2F] font-semibold"
                : "border-[#D9CDB6] text-[#6B5E4F] hover:text-[#3B241A]")
            }
          >
            {resetArmed ? "برای تأیید دوباره بزن" : "بازنشانی داده‌های نمونه"}
          </button>
        </div>
        {syncError && (
          <div className="mt-2 text-xs text-[#8A3C2F] bg-[#F3DFDA] border border-[#E3B6AC] rounded-lg px-4 py-2">
            ذخیره‌سازی مشترک الان در دسترس نیست — تغییرات فقط روی همین صفحه می‌مونه.
          </div>
        )}
      </div>

      {toast && (
        <div className="mx-auto max-w-6xl px-5">
          <div className="mt-4 text-sm bg-[#16A34A] text-white rounded-lg px-4 py-2.5 flex items-center gap-2">
            <CheckCircle2 size={16} />
            {toast}
          </div>
        </div>
      )}
      {errorMsg && (
        <div className="mx-auto max-w-6xl px-5">
          <div className="mt-4 text-sm bg-[#DC2626] text-white rounded-lg px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle size={16} />
            {errorMsg}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-5 py-8">
        {loading ? (
          <div className="text-center py-24 text-sm text-[#6B5E4F]">در حال بارگذاری اطلاعات مشترک…</div>
        ) : view === "store" ? (
          <StoreView
            products={products}
            ledger={ledger}
            highlightId={highlightId}
            confirmDeleteId={confirmDeleteId}
            toast={toast}
            errorMsg={errorMsg}
            onCreateOrder={createOrder}
            onDelete={deleteOrder}
            onJump={jumpToOrder}
            showError={showError}
          />
        ) : view === "workshop" ? (
          <WorkshopView
            stationOrders={stationOrders}
            highlightId={highlightId}
            confirmDeleteId={confirmDeleteId}
            onAdvance={advanceProduction}
            onDeliver={deliver}
            onDelete={deleteOrder}
          />
        ) : view === "products" ? (
          <ProductsView
            products={products}
            confirmDeleteProductId={confirmDeleteProductId}
            onAddProduct={addProduct}
            onDeleteProduct={deleteProduct}
          />
        ) : (
          <HistoryView orders={orders} />
        )}
      </main>
    </div>
  );
}
