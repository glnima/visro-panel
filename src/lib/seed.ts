import type { Order, Product } from "./types";
import { daysAgo, daysFromNow } from "./format";
import { emptyProduction, fullProduction } from "./production";

export const seedProducts: Product[] = [
  { id: "P1", name: "کاناپه سه‌نفره", category: "مبل", price: 45000000 },
  { id: "P2", name: "مبل راحتی ال‌شکل", category: "مبل", price: 68000000 },
  { id: "P3", name: "صندلی ناهارخوری (ست ۶ عددی)", category: "صندلی", price: 32000000 },
  { id: "P4", name: "مبل کلاسیک هفت‌نفره", category: "مبل", price: 95000000 },
  { id: "P5", name: "تخت‌خواب‌شو", category: "مبل", price: 52000000 },
  { id: "P6", name: "میز جلومبلی", category: "میز وسط", price: 18000000 },
  { id: "P7", name: "میز ناهارخوری", category: "میز ناهارخوری", price: 27000000 },
];

// Dates are relative to today, so this is a function rather than a constant.
export function seedOrders(): Order[] {
  return [
    {
      id: "SF-1027", customer: "بوتیک مبلمان الوند",
      items: [{ productId: "P5", productName: "تخت‌خواب‌شو", unitPrice: 52000000, qty: 1, fabricColor: "", woodColor: "" }],
      requested: daysAgo(3), createdAt: daysAgo(20), registeredAt: daysAgo(20) + "T09:15:00",
      production: fullProduction(), delivered: true, deliveredAt: daysAgo(5), notes: "",
    },
    {
      id: "SF-1028", customer: "فروشگاه رویا",
      items: [{ productId: "P4", productName: "مبل کلاسیک هفت‌نفره", unitPrice: 95000000, qty: 1, fabricColor: "مخمل سرمه‌ای", woodColor: "گردو تیره" }],
      requested: daysAgo(2), createdAt: daysAgo(33), registeredAt: daysAgo(33) + "T11:05:00",
      production: { carpentry: true, zirkar: false, rangkar: true, tailor: false, ruyekoob: false }, delivered: false, deliveredAt: null, notes: "",
    },
    {
      id: "SF-1029", customer: "فروشگاه رویا",
      items: [{ productId: "P1", productName: "کاناپه سه‌نفره", unitPrice: 45000000, qty: 1, fabricColor: "", woodColor: "" }],
      requested: daysFromNow(6), createdAt: daysAgo(12), registeredAt: daysAgo(12) + "T14:40:00",
      production: emptyProduction(), delivered: false, deliveredAt: null, notes: "",
    },
    {
      id: "SF-1030", customer: "دکوراسیون ماهور",
      items: [
        { productId: "P4", productName: "مبل کلاسیک هفت‌نفره", unitPrice: 95000000, qty: 1, fabricColor: "چرم مصنوعی مشکی", woodColor: "راش روشن" },
        { productId: "P6", productName: "میز جلومبلی", unitPrice: 18000000, qty: 1, fabricColor: "", woodColor: "راش روشن" },
      ],
      requested: daysFromNow(0), createdAt: daysAgo(9), registeredAt: daysAgo(9) + "T08:50:00",
      production: fullProduction(), delivered: false, deliveredAt: null, notes: "",
    },
    {
      id: "SF-1031", customer: "بوتیک مبلمان الوند",
      items: [{ productId: "P1", productName: "کاناپه سه‌نفره", unitPrice: 45000000, qty: 2, fabricColor: "مخمل زرشکی", woodColor: "" }],
      requested: daysFromNow(3), createdAt: daysAgo(15), registeredAt: daysAgo(15) + "T16:20:00",
      production: { carpentry: true, zirkar: true, rangkar: false, tailor: true, ruyekoob: false }, delivered: false, deliveredAt: null, notes: "",
    },
    {
      id: "SF-1032", customer: "بوتیک مبلمان الوند",
      items: [{ productId: "P2", productName: "مبل راحتی ال‌شکل", unitPrice: 68000000, qty: 1, fabricColor: "", woodColor: "" }],
      requested: daysFromNow(5), createdAt: daysAgo(18), registeredAt: daysAgo(18) + "T10:10:00",
      production: { carpentry: true, zirkar: false, rangkar: false, tailor: false, ruyekoob: false }, delivered: false, deliveredAt: null, notes: "",
    },
    {
      id: "SF-1033", customer: "دکوراسیون ماهور",
      items: [{ productId: "P3", productName: "صندلی ناهارخوری (ست ۶ عددی)", unitPrice: 32000000, qty: 1, fabricColor: "", woodColor: "" }],
      requested: daysFromNow(1), createdAt: daysAgo(5), registeredAt: daysAgo(5) + "T12:35:00",
      production: emptyProduction(), delivered: false, deliveredAt: null, notes: "",
    },
    {
      id: "SF-1035", customer: "فروشگاه چوب و راحتی",
      items: [{ productId: "P2", productName: "مبل راحتی ال‌شکل", unitPrice: 68000000, qty: 1, fabricColor: "", woodColor: "" }],
      requested: daysFromNow(9), createdAt: daysAgo(2), registeredAt: daysAgo(2) + "T09:05:00",
      production: { carpentry: false, zirkar: false, rangkar: false, tailor: true, ruyekoob: false }, delivered: false, deliveredAt: null, notes: "",
    },
    {
      id: "SF-1037", customer: "دکوراسیون ماهور",
      items: [{ productId: "P3", productName: "صندلی ناهارخوری (ست ۶ عددی)", unitPrice: 32000000, qty: 1, fabricColor: "چرم قهوه‌ای", woodColor: "راش تیره" }],
      requested: daysFromNow(2), createdAt: daysAgo(22), registeredAt: daysAgo(22) + "T13:50:00",
      production: { carpentry: true, zirkar: true, rangkar: true, tailor: true, ruyekoob: false }, delivered: false, deliveredAt: null, notes: "",
    },
  ];
}
