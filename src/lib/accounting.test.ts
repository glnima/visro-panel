import { describe, expect, it } from "vitest";
import { materialNeeds, orderBalance, payState, readyShortages, stockLevel } from "./accounting";
import type { Material, Order, Product } from "./types";

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
