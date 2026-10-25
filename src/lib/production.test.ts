import { describe, expect, it } from "vitest";
import {
  currentStationText,
  emptyProduction,
  fullProduction,
  groupByStation,
  isLastBlocker,
  nextStepMessage,
  statusOf,
} from "./production";
import type { Order, Production, StationKey } from "./types";

function order(production: Partial<Production>, extra: Partial<Order> = {}): Order {
  return {
    id: "SF-1",
    customer: "مشتری",
    items: [],
    createdAt: "2026-10-01",
    requested: "2026-10-15",
    registeredAt: null,
    production: { ...emptyProduction(), ...production },
    delivered: false,
    deliveredAt: null,
    notes: "",
    ...extra,
  };
}

function stationsOf(o: Order): StationKey[] {
  const groups = groupByStation([o]);
  return (Object.keys(groups) as StationKey[]).filter((k) => groups[k].length > 0);
}

describe("groupByStation", () => {
  it("puts a new order in carpentry and tailor in parallel", () => {
    expect(stationsOf(order({}))).toEqual(["carpentry", "tailor"]);
  });

  it("splits into zirkar and rangkar once carpentry is done", () => {
    expect(stationsOf(order({ carpentry: true }))).toEqual(["zirkar", "rangkar", "tailor"]);
  });

  it("waits for all four before ruyekoob", () => {
    expect(stationsOf(order({ carpentry: true, zirkar: true, rangkar: true }))).toEqual(["tailor"]);
    expect(stationsOf(order({ carpentry: true, zirkar: true, rangkar: true, tailor: true }))).toEqual(["ruyekoob"]);
  });

  it("moves to final after ruyekoob", () => {
    expect(stationsOf(order(fullProduction()))).toEqual(["final"]);
  });

  it("drops delivered orders", () => {
    expect(stationsOf(order(fullProduction(), { delivered: true }))).toEqual([]);
  });
});

describe("isLastBlocker", () => {
  it("flags the only remaining one of zirkar / rangkar / tailor", () => {
    const p = { ...emptyProduction(), carpentry: true, zirkar: true, tailor: true };
    expect(isLastBlocker(p, "rangkar")).toBe(true);
    expect(isLastBlocker(p, "zirkar")).toBe(false);
  });

  it("does not flag when two are still open", () => {
    expect(isLastBlocker({ ...emptyProduction(), carpentry: true, zirkar: true }, "rangkar")).toBe(false);
  });

  it("never flags carpentry, ruyekoob or final", () => {
    expect(isLastBlocker(emptyProduction(), "carpentry")).toBe(false);
    expect(isLastBlocker(fullProduction(), "final")).toBe(false);
  });
});

describe("currentStationText", () => {
  it("describes parallel stations", () => {
    expect(currentStationText(order({}))).toBe("نجاری + خیاط");
    expect(currentStationText(order({ carpentry: true, tailor: true }))).toBe("زیرکار + رنگکار");
  });

  it("reports final and delivered", () => {
    expect(currentStationText(order(fullProduction()))).toBe("تحویل نهایی");
    expect(currentStationText(order(fullProduction(), { delivered: true }))).toBe("تحویل شده");
  });
});

describe("nextStepMessage", () => {
  it("lists what the order is waiting on", () => {
    expect(nextStepMessage({ ...emptyProduction(), carpentry: true })).toBe("منتظر زیرکار و رنگکار و خیاط");
  });

  it("announces ruyekoob when the trio is done", () => {
    expect(nextStepMessage({ ...emptyProduction(), carpentry: true, zirkar: true, rangkar: true, tailor: true })).toBe(
      "آماده‌ی رویه‌کوب شد"
    );
  });
});

describe("statusOf", () => {
  const today = new Date("2026-10-25T12:00:00");

  it.each([
    ["2026-10-25", "sage", "امروز ثبت شد"],
    ["2026-10-20", "sage", "روز ۵ از ۳۰"],
    ["2026-10-10", "brass", "روز ۱۵ از ۳۰"],
    ["2026-09-30", "brick", "روز ۲۵ از ۳۰"],
    ["2026-09-15", "brick", "۱۰ روز تأخیر"],
  ])("created %s → %s", (createdAt, tone, text) => {
    expect(statusOf(order({}, { createdAt }), today)).toEqual({ tone, text });
  });

  it("is blue once delivered", () => {
    expect(statusOf(order({}, { delivered: true }), today).tone).toBe("blue");
  });
});
