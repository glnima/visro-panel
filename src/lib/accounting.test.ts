import { describe, expect, it } from "vitest";
import { ledgerCsv, ledgerTotals, materialNeeds, orderBalance, payState, readyShortages, stockLevel } from "./accounting";
import type { LedgerEntry, Material, Order, Product } from "./types";

const item = (unitPrice: number, qty: number) => ({
  id: 1, productId: 1, productName: "مبل", unitPrice, qty, fabricColor: "", woodColor: "",
  production: { carpentry: false, zirkar: false, rangkar: false, tailor: false, ruyekoob: false }, done: {}, delays: [],
});
const order = (paid: number[]): Order => ({
  id: 1, code: "SF-1", customerId: 1, customer: "م", items: [item(100, 2)], orderDate: "2026-01-01", requested: "2026-01-02",
  registeredAt: "", deliveredAt: null, notes: "", version: 1, fromStock: false,
  payments: paid.map((amount, i) => ({ id: i, amount, method: "cash", paidOn: "2026-01-01", note: "", by: null })),
});
const material = (id: number, stock: number, minStock = 0): Material => ({ id, name: `m${id}`, unit: "عدد", stock, minStock, active: true });
const product = (id: number, readyStock: number, bom: Product["bom"] = []): Product => ({ id, name: `p${id}`, categoryId: 1, price: 1, active: true, readyStock, bom });

describe("payment state", () => {
  it.each([
    [[], "unpaid", 200],
    [[50], "partial", 150],
    [[150, 50], "settled", 0],
    [[250], "over", -50],
  ])("paid %j → %s", (paid, state, balance) => {
    expect(payState(order(paid as number[]))).toBe(state);
    expect(orderBalance(order(paid as number[]))).toBe(balance);
  });
});

describe("stock helpers", () => {
  it("classifies levels", () => {
    expect(stockLevel(material(1, 50, 10))).toBe("ok");
    expect(stockLevel(material(1, 10, 10))).toBe("low");
    expect(stockLevel(material(1, -1, 10))).toBe("short");
  });

  it("adds up what lines need and what's missing", () => {
    const products = [product(1, 0, [{ materialId: 1, qty: 100 }, { materialId: 2, qty: 2.5 }]), product(2, 0, [{ materialId: 1, qty: 10 }])];
    const needs = materialNeeds([{ productId: 1, qty: 2 }, { productId: 2, qty: 1 }], products, [material(1, 150), material(2, 10)]);
    expect(needs.find((n) => n.material.id === 1)).toMatchObject({ need: 210, short: 60 });
    expect(needs.find((n) => n.material.id === 2)).toMatchObject({ need: 5, short: 0 });
  });

  it("finds finished pieces the shop doesn't have, across lines", () => {
    const short = readyShortages([{ productId: 1, qty: 1 }, { productId: 1, qty: 1 }, { productId: 2, qty: 1 }], [product(1, 1), product(2, 1)]);
    expect(short.map((s) => s.product.id)).toEqual([1]);
  });
});

describe("payments ledger", () => {
  const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
    id: 1, orderCode: "SF-1", customer: "علی", amount: 100, method: "cash", paidOn: "2026-11-06", note: "", by: "فروشگاه",
    voidedAt: null, voidedBy: null, orderDeleted: false, ...over,
  });

  it("counts only valid payments, per method", () => {
    const t = ledgerTotals([
      entry({ amount: 100 }),
      entry({ amount: 50, method: "card" }),
      entry({ amount: 999, voidedAt: "2026-11-06T00:00:00Z" }),
      entry({ amount: 999, orderDeleted: true }),
    ]);
    expect(t.total).toBe(150);
    expect(t.byMethod).toEqual([{ method: "cash", amount: 100 }, { method: "card", amount: 50 }]);
  });

  it("exports CSV Excel can read, with status, quoting and no live formulas", () => {
    const csv = ledgerCsv([entry({ customer: "=HYPERLINK(1)", note: 'گفت "فردا"، حتماً, لطفاً' }), entry({ voidedAt: "x", voidedBy: "سارا" })], (d) => `j${d}`);
    const lines = csv.split("\r\n");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[1]).toContain("'=HYPERLINK(1)");
    expect(lines[1]).toContain('"گفت ""فردا""، حتماً, لطفاً"');
    expect(lines[1]).toContain("j2026-11-06,2026-11-06");
    expect(lines[1].endsWith("معتبر")).toBe(true);
    expect(lines[2].endsWith("باطل (سارا)")).toBe(true);
  });
});
