import { CATEGORIES, type Category, type Order, type OrderItem, type Product } from "./types";
import { daysAgo, daysFromNow } from "./format";
import { seedOrders, seedProducts } from "./seed";

type Loose = Record<string, unknown>;

const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown) => Number(v);

export function sanitizeItems(o: Loose): OrderItem[] {
  const legacyFabric = str(o.fabricColor) ? o.fabricColor : "";
  const legacyWood = str(o.woodColor) ? o.woodColor : "";
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items
      .filter((it): it is Loose => !!it && typeof it === "object")
      .map((it) => ({
        productId: str(it.productId) ? it.productId : "",
        productName: str(it.productName) && it.productName ? it.productName : "نامشخص",
        unitPrice: Number.isFinite(num(it.unitPrice)) ? num(it.unitPrice) : 0,
        qty: Number.isFinite(num(it.qty)) && num(it.qty) > 0 ? num(it.qty) : 1,
        fabricColor: str(it.fabricColor) ? it.fabricColor : legacyFabric,
        woodColor: str(it.woodColor) ? it.woodColor : legacyWood,
      }));
  }
  // legacy single-product orders saved before multi-item support
  if (str(o.productName) && o.productName) {
    return [
      {
        productId: str(o.productId) ? o.productId : "",
        productName: o.productName,
        unitPrice: Number.isFinite(num(o.unitPrice)) ? num(o.unitPrice) : 0,
        qty: Number.isFinite(num(o.qty)) && num(o.qty) > 0 ? num(o.qty) : 1,
        fabricColor: legacyFabric,
        woodColor: legacyWood,
      },
    ];
  }
  return [];
}

export function sanitizeOrders(list: unknown): Order[] {
  if (!Array.isArray(list)) return seedOrders();
  return list
    .filter((o): o is Loose => !!o && typeof o === "object")
    .map((o, i) => {
      const p = (o.production && typeof o.production === "object" ? o.production : {}) as Loose;
      return {
        id: str(o.id) && /^SF-\d+$/.test(o.id) ? o.id : `SF-${2000 + i}`,
        customer: str(o.customer) && o.customer.trim() ? o.customer : "بدون نام",
        items: sanitizeItems(o),
        requested: str(o.requested) && o.requested ? o.requested : daysFromNow(14),
        createdAt: str(o.createdAt) && o.createdAt ? o.createdAt : str(o.requested) ? o.requested : daysAgo(0),
        registeredAt: str(o.registeredAt) && o.registeredAt ? o.registeredAt : null,
        production: {
          carpentry: !!p.carpentry,
          zirkar: !!p.zirkar,
          rangkar: !!p.rangkar,
          tailor: !!p.tailor,
          ruyekoob: !!p.ruyekoob,
        },
        delivered: !!o.delivered,
        deliveredAt: str(o.deliveredAt) ? o.deliveredAt : null,
        notes: str(o.notes) ? o.notes : "",
      };
    });
}

export function sanitizeProducts(list: unknown): Product[] {
  if (!Array.isArray(list)) return seedProducts;
  return list
    .filter((p): p is Loose => !!p && typeof p === "object")
    .map((p, i) => ({
      id: str(p.id) && p.id ? p.id : `P${100 + i}`,
      name: str(p.name) && p.name.trim() ? p.name : "بدون نام",
      category: CATEGORIES.includes(p.category as Category) ? (p.category as Category) : CATEGORIES[0],
      price: Number.isFinite(num(p.price)) && num(p.price) >= 0 ? num(p.price) : 0,
    }));
}
