import { PAYMENT_METHODS, type LedgerEntry, type Material, type Order, type Product } from "./types";
import { orderTotals } from "./production";

// ---- money ----

export const orderPaid = (o: Order) => o.payments.reduce((s, p) => s + p.amount, 0);
export const orderBalance = (o: Order) => orderTotals(o).price - orderPaid(o);

export type PayState = "unpaid" | "partial" | "settled" | "over";

export function payState(o: Order): PayState {
  const balance = orderBalance(o);
  if (balance < 0) return "over"; // the order was edited down after being paid
  if (balance === 0) return "settled";
  return orderPaid(o) > 0 ? "partial" : "unpaid";
}

export const PAY_STATE_LABELS: Record<PayState, string> = {
  unpaid: "پرداخت نشده",
  partial: "مانده دارد",
  settled: "تسویه",
  over: "بستانکار",
};

// ---- stock ----

export type StockLevel = "ok" | "low" | "short";

export function stockLevel(m: Material): StockLevel {
  if (m.stock < 0) return "short";
  return m.stock <= m.minStock ? "low" : "ok";
}

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = { ok: "موجود", low: "رو به اتمام", short: "کسری" };

// Materials a set of order lines needs, compared with what's in the warehouse.
export function materialNeeds(
  lines: { productId: number; qty: number }[],
  products: Product[],
  materials: Material[]
): { material: Material; need: number; short: number }[] {
  const need = new Map<number, number>();
  for (const l of lines) {
    for (const b of products.find((p) => p.id === l.productId)?.bom ?? []) {
      need.set(b.materialId, (need.get(b.materialId) ?? 0) + b.qty * l.qty);
    }
  }
  return [...need.entries()].flatMap(([id, amount]) => {
    const material = materials.find((m) => m.id === id);
    return material ? [{ material, need: amount, short: Math.max(0, amount - material.stock) }] : [];
  });
}

// Lines asking for more finished pieces than the shop has.
export function readyShortages(lines: { productId: number; qty: number }[], products: Product[]): { product: Product; need: number }[] {
  const need = new Map<number, number>();
  for (const l of lines) need.set(l.productId, (need.get(l.productId) ?? 0) + l.qty);
  return [...need.entries()].flatMap(([id, amount]) => {
    const product = products.find((p) => p.id === id);
    return product && amount > product.readyStock ? [{ product, need: amount }] : [];
  });
}

// ---- the payments ledger ----

// Only money that really counts: not voided, not on a cancelled order.
export const ledgerCounts = (e: LedgerEntry) => !e.voidedAt && !e.orderDeleted;

export function ledgerTotals(entries: LedgerEntry[]): { total: number; byMethod: { method: LedgerEntry["method"]; amount: number }[] } {
  const counted = entries.filter(ledgerCounts);
  const byMethod = (Object.keys(PAYMENT_METHODS) as LedgerEntry["method"][])
    .map((method) => ({ method, amount: counted.filter((e) => e.method === method).reduce((s, e) => s + e.amount, 0) }))
    .filter((m) => m.amount > 0);
  return { total: counted.reduce((s, e) => s + e.amount, 0), byMethod };
}

// A spreadsheet treats a cell starting with = + - @ as a formula, so names and
// notes are neutralised before they reach Excel.
function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV for Excel: the BOM makes it read Persian text correctly.
export function ledgerCsv(entries: LedgerEntry[], jalaliDate: (iso: string) => string): string {
  const header = ["تاریخ", "تاریخ میلادی", "سفارش", "مشتری", "مبلغ (تومان)", "روش", "توضیح", "ثبت‌کننده", "وضعیت"];
  const rows = entries.map((e) => [
    jalaliDate(e.paidOn),
    e.paidOn,
    e.orderCode,
    e.customer,
    e.amount,
    PAYMENT_METHODS[e.method],
    e.note,
    e.by ?? "",
    e.voidedAt ? `باطل${e.voidedBy ? ` (${e.voidedBy})` : ""}` : e.orderDeleted ? "سفارش حذف شده" : "معتبر",
  ]);
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
