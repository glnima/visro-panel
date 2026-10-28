export const STAGES = ["carpentry", "zirkar", "rangkar", "tailor", "ruyekoob"] as const;
export type StageKey = (typeof STAGES)[number];
export type StationKey = StageKey | "final";

// A station role (e.g. "carpentry") can only act on its own stage.
export type Role = "admin" | "store" | "workshop" | StageKey;

export const ROLES: Role[] = ["admin", "store", "workshop", ...STAGES];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدیر",
  store: "فروشگاه",
  workshop: "سرپرست کارگاه",
  carpentry: "نجاری",
  zirkar: "زیرکار",
  rangkar: "رنگکار",
  tailor: "خیاط",
  ruyekoob: "رویه‌کوب",
};

export const isStationRole = (role: Role): role is StageKey => (STAGES as readonly string[]).includes(role);

// Who may mark a stage done / undo it / report a delay on it.
export const canWorkStage = (role: Role, stage: StageKey) => role === "admin" || role === "workshop" || role === stage;

// Only the store, admin and supervisor hand orders over.
export const canDeliver = (role: Role) => role === "admin" || role === "store" || role === "workshop";

export const canSeePrices = (role: Role) => role === "admin" || role === "store";

export type User = {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
};

export type Production = Record<StageKey, boolean>;

export type Station = {
  key: StationKey;
  label: string;
  capacity: number;
  sort: number;
};

export type Category = {
  id: number;
  name: string;
  sort: number;
};

export type Product = {
  id: number;
  name: string;
  categoryId: number;
  price: number | null; // null when the viewer may not see prices
  active: boolean;
};

export type Customer = {
  id: number;
  name: string;
  phone: string;
  notes: string;
};

export type StageDone = { at: string; by: string | null };

export const DELAY_REASONS = {
  materials: "کمبود مواد / متریال",
  fabric: "پارچه نرسیده",
  machine: "خرابی دستگاه",
  staff: "کمبود نیرو",
  rework: "اصلاح / دوباره‌کاری",
  customer: "منتظر تأیید مشتری",
  other: "سایر",
} as const;
export type DelayReason = keyof typeof DELAY_REASONS;

export type Delay = {
  id: number;
  stage: StageKey;
  reason: DelayReason;
  note: string;
  eta: string | null; // new estimated finish date, ISO yyyy-mm-dd
  at: string;
  by: string | null;
};

export type OrderItem = {
  id: number;
  productId: number | null;
  productName: string; // snapshot at order time
  unitPrice: number | null; // snapshot at order time; null when hidden
  qty: number;
  fabricColor: string;
  woodColor: string;
  production: Production;
  done: Partial<Record<StageKey, StageDone>>; // when / by whom each finished stage was marked
  delays: Delay[]; // open (unresolved) delays
};

export type Order = {
  id: number;
  code: string; // "SF-1027", ...
  customerId: number;
  customer: string;
  items: OrderItem[];
  orderDate: string; // ISO yyyy-mm-dd
  requested: string; // requested delivery date, ISO yyyy-mm-dd
  registeredAt: string; // full ISO timestamp of entry
  deliveredAt: string | null; // ISO yyyy-mm-dd
  notes: string;
  version: number;
};

export const MAX_PRODUCTS = 200;

export type Bootstrap = {
  me: User;
  version: number;
  stations: Station[];
  categories: Category[];
  products: Product[];
  customers: Customer[];
  orders: Order[];
};

export type OrderEvent = {
  id: number;
  at: string;
  kind: string;
  stage: StageKey | null;
  orderCode: string | null;
  itemName: string | null;
  user: string | null;
  details: Record<string, unknown>;
};

export type FeedbackKind = "bug" | "idea" | "other";

export type Feedback = {
  id: number;
  kind: FeedbackKind;
  body: string;
  page: string;
  done: boolean;
  at: string;
  user: string | null;
  role: Role | null;
};
