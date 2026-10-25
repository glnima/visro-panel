export const CATEGORIES = [
  "مبل",
  "صندلی",
  "میز ناهارخوری",
  "میز وسط",
  "سرویس خواب",
  "گل میز",
  "آباژور",
  "چوب لباسی",
  "قاب آیینه",
  "اکسسوری",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Product = {
  id: string; // "P1", "P2", ...
  name: string;
  category: Category;
  price: number; // toman
};

export type OrderItem = {
  productId: string;
  productName: string; // snapshot at order time
  unitPrice: number; // snapshot at order time
  qty: number;
  fabricColor: string;
  woodColor: string;
};

export type StageKey = "carpentry" | "zirkar" | "rangkar" | "tailor" | "ruyekoob";
export type StationKey = StageKey | "final";

export type Production = Record<StageKey, boolean>;

export type Order = {
  id: string; // "SF-1027", ...
  customer: string;
  items: OrderItem[];
  createdAt: string; // order date, ISO yyyy-mm-dd
  requested: string; // requested delivery date, ISO yyyy-mm-dd
  registeredAt: string | null; // full ISO timestamp of entry
  production: Production;
  delivered: boolean;
  deliveredAt: string | null; // ISO yyyy-mm-dd
  notes: string;
};
