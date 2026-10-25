import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATIONS,
  compareLedger,
  currentStationText,
  emptyProduction,
  fullProduction,
  groupByStation,
  isLastBlocker,
  itemStations,
  nextStepMessage,
  stageChangeError,
  statusOf,
} from "./production";
import type { Order, OrderItem, Production, StationKey } from "./types";

const P = (on: string): Production => ({
  ...emptyProduction(),
  ...Object.fromEntries(on.split(",").filter(Boolean).map((k) => [k, true])),
});

let seq = 0;
function item(production: Production): OrderItem {
  return { id: ++seq, productId: 1, productName: "مبل", unitPrice: 10, qty: 1, fabricColor: "", woodColor: "", production };
}

function order(items: Production[], extra: Partial<Order> = {}): Order {
  return {
    id: ++seq, code: "SF-1", customerId: 1, customer: "مشتری", items: items.map(item),
    orderDate: "2026-10-01", requested: "2026-10-15", registeredAt: "2026-10-01T07:00:00.000Z",
    deliveredAt: null, notes: "", version: 1, ...extra,
  };
}

function columnsOf(o: Order): StationKey[] {
  const g = groupByStation([o]);
  return (Object.keys(g) as StationKey[]).filter((k) => g[k].length > 0);
}

describe("itemStations", () => {
  it.each([
    ["", ["carpentry", "tailor"]],
    ["carpentry", ["zirkar", "rangkar", "tailor"]],
    ["carpentry,zirkar,rangkar", ["tailor"]],
    ["carpentry,zirkar,rangkar,tailor", ["ruyekoob"]],
    ["carpentry,zirkar,rangkar,tailor,ruyekoob", []],
  ])("%s → %j", (on, expected) => {
    expect(itemStations(P(on))).toEqual(expected);
  });
});

describe("groupByStation (per item)", () => {
  it("puts each item in its own columns", () => {
    const g = groupByStation([order([P(""), P("carpentry,zirkar,rangkar,tailor")])]);
    expect(g.carpentry).toHaveLength(1);
    expect(g.tailor).toHaveLength(1);
    expect(g.ruyekoob).toHaveLength(1);
    expect(g.final).toHaveLength(0);
  });

  it("moves the whole order to final only when every item is done", () => {
    expect(columnsOf(order([fullProduction(), P("carpentry")]))).toEqual(["zirkar", "rangkar", "tailor"]);
    const g = groupByStation([order([fullProduction(), fullProduction()])]);
    expect(g.final).toHaveLength(1);
    expect(g.final[0].item).toBeNull();
  });

  it("drops delivered orders", () => {
    expect(columnsOf(order([fullProduction()], { deliveredAt: "2026-10-10" }))).toEqual([]);
  });
});

describe("stageChangeError", () => {
  it("enforces prerequisites", () => {
    expect(stageChangeError(P(""), "zirkar", true)).not.toBeNull();
    expect(stageChangeError(P("carpentry"), "zirkar", true)).toBeNull();
    expect(stageChangeError(P("carpentry,zirkar,rangkar"), "ruyekoob", true)).not.toBeNull();
  });

  it("blocks undoing a stage that later stages depend on", () => {
    expect(stageChangeError(P("carpentry,zirkar"), "carpentry", false)).not.toBeNull();
    expect(stageChangeError(P("carpentry"), "carpentry", false)).toBeNull();
  });
});

describe("isLastBlocker", () => {
  it("flags the only stage anyone can still work on", () => {
    expect(isLastBlocker(P("carpentry,zirkar,tailor"), "rangkar")).toBe(true);
    expect(isLastBlocker(P("carpentry,zirkar,rangkar"), "tailor")).toBe(true);
    expect(isLastBlocker(P("carpentry,zirkar"), "rangkar")).toBe(false);
  });

  it("now also covers carpentry once tailoring is done", () => {
    expect(isLastBlocker(P("tailor"), "carpentry")).toBe(true);
    expect(isLastBlocker(P(""), "carpentry")).toBe(false);
  });
});

describe("currentStationText", () => {
  it("agrees with the board", () => {
    expect(currentStationText(order([P("")]), DEFAULT_STATIONS)).toBe("نجاری + خیاط");
    expect(currentStationText(order([fullProduction()]), DEFAULT_STATIONS)).toBe("تحویل نهایی");
    expect(currentStationText(order([P(""), P("carpentry")]), DEFAULT_STATIONS)).toBe("نجاری + زیرکار + رنگکار + خیاط");
  });
});

describe("nextStepMessage", () => {
  it("lists what the item waits on", () => {
    expect(nextStepMessage(P("carpentry"), DEFAULT_STATIONS)).toBe("منتظر زیرکار و رنگکار و خیاط");
    expect(nextStepMessage(P("carpentry,zirkar,rangkar,tailor"), DEFAULT_STATIONS)).toBe("آماده‌ی رویه‌کوب شد");
  });
});

describe("statusOf (against the promised date)", () => {
  const today = "2026-10-25";
  it.each([
    ["2026-11-10", "sage", "۱۶ روز مونده"],
    ["2026-10-27", "brass", "۲ روز مونده"],
    ["2026-10-25", "brass", "امروز تحویل"],
    ["2026-10-20", "brick", "۵ روز تأخیر"],
  ])("requested %s → %s", (requested, tone, text) => {
    expect(statusOf(order([P("")], { requested, orderDate: "2026-09-01" }), today)).toEqual({ tone, text });
  });

  it("is late even when the order is recent, if the promise has passed", () => {
    expect(statusOf(order([P("")], { orderDate: "2026-10-22", requested: "2026-10-24" }), today).tone).toBe("brick");
  });

  it("is blue once delivered and notes lateness", () => {
    expect(statusOf(order([fullProduction()], { deliveredAt: "2026-10-18" }), today)).toEqual({
      tone: "blue",
      text: "تحویل شده (۳ روز دیر)",
    });
  });
});

describe("compareLedger", () => {
  it("breaks same-day ties by entry time", () => {
    const a = order([P("")], { registeredAt: "2026-10-01T06:00:00.000Z" });
    const b = order([P("")], { registeredAt: "2026-10-01T09:00:00.000Z" });
    expect([a, b].sort(compareLedger)[0]).toBe(b);
  });
});
