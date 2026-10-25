import type { Order, Production, StationKey } from "./types";
import { faNum } from "./format";

export type Station = { key: StationKey; label: string; capacity: number };

export const STATIONS: Station[] = [
  { key: "carpentry", label: "نجاری", capacity: 6 },
  { key: "zirkar", label: "زیرکار", capacity: 4 },
  { key: "rangkar", label: "رنگکار", capacity: 4 },
  { key: "tailor", label: "خیاط", capacity: 4 },
  { key: "ruyekoob", label: "رویه‌کوب", capacity: 3 },
  { key: "final", label: "تحویل نهایی", capacity: 8 },
];

export type Tone = "sage" | "brass" | "brick" | "blue" | "neutral";

export const toneColor: Record<Tone, string> = {
  sage: "#16A34A",
  brass: "#D97706",
  brick: "#DC2626",
  blue: "#2563EB",
  neutral: "#D9CDB6",
};

export function emptyProduction(): Production {
  return { carpentry: false, zirkar: false, rangkar: false, tailor: false, ruyekoob: false };
}

export function fullProduction(): Production {
  return { carpentry: true, zirkar: true, rangkar: true, tailor: true, ruyekoob: true };
}

// NOTE: counts days since the order date against a fixed 30-day target and
// ignores the requested delivery date. Kept as in the prototype; fixed in Phase 1.
export function statusOf(order: Order, today: Date = new Date()): { text: string; tone: Tone } {
  if (order.delivered) return { text: "تحویل شده", tone: "blue" };
  const created = new Date((order.createdAt || order.requested) + "T00:00:00");
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  const elapsed = Math.round((now.getTime() - created.getTime()) / 86400000);
  if (elapsed <= 0) return { text: "امروز ثبت شد", tone: "sage" };
  if (elapsed > 30) return { text: `${faNum(elapsed - 30)} روز تأخیر`, tone: "brick" };
  if (elapsed <= 10) return { text: `روز ${faNum(elapsed)} از ۳۰`, tone: "sage" };
  if (elapsed <= 20) return { text: `روز ${faNum(elapsed)} از ۳۰`, tone: "brass" };
  return { text: `روز ${faNum(elapsed)} از ۳۰`, tone: "brick" };
}

export function isLastBlocker(production: Production | undefined, stationKey: StationKey): boolean {
  const p = production || emptyProduction();
  if (stationKey !== "zirkar" && stationKey !== "rangkar" && stationKey !== "tailor") return false;
  const trio = { zirkar: p.zirkar, rangkar: p.rangkar, tailor: p.tailor };
  if (trio[stationKey]) return false;
  return (Object.keys(trio) as (keyof typeof trio)[])
    .filter((k) => k !== stationKey)
    .every((k) => trio[k]);
}

export function currentStationText(o: Order): string {
  if (o.delivered) return "تحویل شده";
  const p = o.production || emptyProduction();
  if (p.ruyekoob) return "تحویل نهایی";
  if (p.zirkar && p.rangkar && p.tailor) return "رویه‌کوب";
  const parts = [];
  if (!p.carpentry) parts.push("نجاری");
  else {
    if (!p.zirkar) parts.push("زیرکار");
    if (!p.rangkar) parts.push("رنگکار");
  }
  if (!p.tailor) parts.push("خیاط");
  return parts.length ? parts.join(" + ") : "در جریان";
}

// Which station columns each undelivered order appears in (up to three at once).
export function groupByStation(orders: Order[]): Record<StationKey, Order[]> {
  const groups: Record<StationKey, Order[]> = {
    carpentry: [], zirkar: [], rangkar: [], tailor: [], ruyekoob: [], final: [],
  };
  orders.forEach((o) => {
    if (o.delivered) return;
    const p = o.production || emptyProduction();
    if (!p.carpentry) groups.carpentry.push(o);
    else {
      if (!p.zirkar) groups.zirkar.push(o);
      if (!p.rangkar) groups.rangkar.push(o);
    }
    if (!p.tailor) groups.tailor.push(o);
    if (p.carpentry && p.zirkar && p.rangkar && p.tailor && !p.ruyekoob) groups.ruyekoob.push(o);
    if (p.ruyekoob) groups.final.push(o);
  });
  return groups;
}

// Follow-up text shown after a stage is marked done.
export function nextStepMessage(p: Production): string {
  if (p.zirkar && p.rangkar && p.tailor) return "آماده‌ی رویه‌کوب شد";
  const waiting = [];
  if (p.carpentry && !p.zirkar) waiting.push("زیرکار");
  if (p.carpentry && !p.rangkar) waiting.push("رنگکار");
  if (!p.carpentry) waiting.push("نجاری");
  if (!p.tailor) waiting.push("خیاط");
  return waiting.length ? `منتظر ${waiting.join(" و ")}` : "";
}

export function capacityColor(ratio: number): string {
  return ratio >= 1 ? "#DC2626" : ratio >= 0.6 ? "#D97706" : "#16A34A";
}

export function orderTotals(o: Order): { qty: number; price: number; summary: string } {
  const items = o.items || [];
  const qty = items.reduce((sum, it) => sum + it.qty, 0);
  const price = items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
  const summary = items.map((it) => `${it.productName} × ${faNum(it.qty)}`).join("، ");
  return { qty, price, summary };
}
