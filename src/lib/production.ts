import type { Order, OrderItem, Production, StageKey, Station, StationKey } from "./types";
import { daysBetween } from "./dates";
import { faNum } from "./format";

export const DEFAULT_STATIONS: Station[] = [
  { key: "carpentry", label: "نجاری", capacity: 6, sort: 1 },
  { key: "zirkar", label: "زیرکار", capacity: 4, sort: 2 },
  { key: "rangkar", label: "رنگکار", capacity: 4, sort: 3 },
  { key: "tailor", label: "خیاط", capacity: 4, sort: 4 },
  { key: "ruyekoob", label: "رویه‌کوب", capacity: 3, sort: 5 },
  { key: "final", label: "تحویل نهایی", capacity: 8, sort: 6 },
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

// ---- the production graph ----
//   carpentry ─┬─ zirkar ──┐
//              └─ rangkar ─┼─ ruyekoob ─ final
//   tailor ────────────────┘
const PREREQS: Record<StageKey, StageKey[]> = {
  carpentry: [],
  zirkar: ["carpentry"],
  rangkar: ["carpentry"],
  tailor: [],
  ruyekoob: ["carpentry", "zirkar", "rangkar", "tailor"],
};

const DEPENDENTS: Record<StageKey, StageKey[]> = {
  carpentry: ["zirkar", "rangkar", "ruyekoob"],
  zirkar: ["ruyekoob"],
  rangkar: ["ruyekoob"],
  tailor: ["ruyekoob"],
  ruyekoob: [],
};

const BEFORE_RUYEKOOB: StageKey[] = ["carpentry", "zirkar", "rangkar", "tailor"];

export function isItemDone(p: Production): boolean {
  return p.ruyekoob;
}

export function isOrderReady(o: Order): boolean {
  return o.items.length > 0 && o.items.every((it) => isItemDone(it.production));
}

export function isDelivered(o: Order): boolean {
  return o.deliveredAt !== null;
}

// The stage columns an item is waiting in right now (up to three at once).
export function itemStations(p: Production): StageKey[] {
  if (p.ruyekoob) return [];
  const out: StageKey[] = [];
  if (!p.carpentry) out.push("carpentry");
  else {
    if (!p.zirkar) out.push("zirkar");
    if (!p.rangkar) out.push("rangkar");
  }
  if (!p.tailor) out.push("tailor");
  if (out.length === 0) out.push("ruyekoob");
  return out;
}

// Why a stage can't be marked done / undone, or null if it can.
export function stageChangeError(p: Production, stage: StageKey, done: boolean): string | null {
  if (p[stage] === done) return done ? "این مرحله قبلاً تمام شده" : "این مرحله هنوز تمام نشده";
  if (done) {
    const missing = PREREQS[stage].filter((s) => !p[s]);
    return missing.length ? "اول باید مرحله‌های قبلی تمام بشه" : null;
  }
  const blocking = DEPENDENTS[stage].filter((s) => p[s]);
  return blocking.length ? "اول باید مرحله‌های بعدی برگرده" : null;
}

// True when this card is the only thing anyone can still work on before
// upholstery: every other unfinished prerequisite is downstream of it.
export function isLastBlocker(p: Production, stage: StationKey): boolean {
  if (stage === "ruyekoob" || stage === "final" || p[stage] || p.ruyekoob) return false;
  const others = BEFORE_RUYEKOOB.filter((s) => s !== stage && !p[s]);
  return others.every((s) => DEPENDENTS[stage].includes(s));
}

export type Card = { order: Order; item: OrderItem | null };

// Workshop columns. Stage columns hold one card per item; the final column
// holds whole orders whose items are all finished.
export function groupByStation(orders: Order[]): Record<StationKey, Card[]> {
  const groups: Record<StationKey, Card[]> = {
    carpentry: [], zirkar: [], rangkar: [], tailor: [], ruyekoob: [], final: [],
  };
  for (const o of orders) {
    if (isDelivered(o)) continue;
    if (isOrderReady(o)) {
      groups.final.push({ order: o, item: null });
      continue;
    }
    for (const it of o.items) {
      for (const s of itemStations(it.production)) groups[s].push({ order: o, item: it });
    }
  }
  return groups;
}

// Station names an order is currently in, in board order.
export function orderStations(o: Order): StationKey[] {
  if (isDelivered(o)) return [];
  if (isOrderReady(o)) return ["final"];
  const set = new Set<StationKey>();
  for (const it of o.items) for (const s of itemStations(it.production)) set.add(s);
  return BEFORE_RUYEKOOB.concat("ruyekoob").filter((s) => set.has(s));
}

export function currentStationText(o: Order, stations: Station[]): string {
  if (isDelivered(o)) return "تحویل شده";
  const label = (k: StationKey) => stations.find((s) => s.key === k)?.label ?? k;
  const keys = orderStations(o);
  return keys.length ? keys.map(label).join(" + ") : "بدون قلم";
}

// Follow-up text shown after a stage is marked done.
export function nextStepMessage(p: Production, stations: Station[]): string {
  const label = (k: StationKey) => stations.find((s) => s.key === k)?.label ?? k;
  if (p.ruyekoob) return "این قلم آماده‌ست";
  const next = itemStations(p);
  if (next.length === 1 && next[0] === "ruyekoob") return `آماده‌ی ${label("ruyekoob")} شد`;
  return `منتظر ${next.map(label).join(" و ")}`;
}

// Status is measured against the promised (requested) delivery date.
export function statusOf(order: Order, today: string): { text: string; tone: Tone } {
  if (order.deliveredAt) {
    const late = daysBetween(order.requested, order.deliveredAt);
    return { text: late > 0 ? `تحویل شده (${faNum(late)} روز دیر)` : "تحویل شده", tone: "blue" };
  }
  const left = daysBetween(today, order.requested);
  if (left < 0) return { text: `${faNum(-left)} روز تأخیر`, tone: "brick" };
  if (left === 0) return { text: "امروز تحویل", tone: "brass" };
  if (left <= 3) return { text: `${faNum(left)} روز مونده`, tone: "brass" };
  return { text: `${faNum(left)} روز مونده`, tone: "sage" };
}

export function capacityColor(ratio: number): string {
  return ratio >= 1 ? "#DC2626" : ratio >= 0.6 ? "#D97706" : "#16A34A";
}

export function orderTotals(o: Order): { qty: number; price: number; summary: string } {
  const qty = o.items.reduce((sum, it) => sum + it.qty, 0);
  const price = o.items.reduce((sum, it) => sum + it.qty * (it.unitPrice ?? 0), 0);
  const summary = o.items.map((it) => `${it.productName} × ${faNum(it.qty)}`).join("، ");
  return { qty, price, summary };
}

export function itemColors(it: OrderItem): string {
  return [it.fabricColor && `پارچه ${it.fabricColor}`, it.woodColor && `چوب ${it.woodColor}`].filter(Boolean).join(" / ");
}

// Undelivered first, then newest order date, then newest entry time.
export function compareLedger(a: Order, b: Order): number {
  if (isDelivered(a) !== isDelivered(b)) return isDelivered(a) ? 1 : -1;
  return b.orderDate.localeCompare(a.orderDate) || b.registeredAt.localeCompare(a.registeredAt);
}
