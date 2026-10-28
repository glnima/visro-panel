import { useState, useMemo, useEffect, useRef } from "react";
import {
  Hammer,
  Layers,
  Paintbrush,
  Shirt,
  Armchair,
  Truck,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ArrowUpLeft,
  History,
  Search,
  Trash2,
} from "lucide-react";

const STATIONS = [
  { key: "carpentry", label: "نجاری", icon: Hammer, capacity: 6 },
  { key: "zirkar", label: "زیرکار", icon: Layers, capacity: 4 },
  { key: "rangkar", label: "رنگکار", icon: Paintbrush, capacity: 4 },
  { key: "tailor", label: "خیاط", icon: Shirt, capacity: 4 },
  { key: "ruyekoob", label: "رویه‌کوب", icon: Armchair, capacity: 3 },
  { key: "final", label: "تحویل نهایی", icon: Truck, capacity: 8 },
];

const CATEGORIES = [
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
];

const STORAGE_KEY = "mizan:orders";
const PRODUCTS_KEY = "mizan:products";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n) {
  return daysAgo(-n);
}

// ---- Jalali (Persian) calendar conversion ----
const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function isJalaliLeap(jy) {
  const mod = ((jy % 33) + 33) % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(mod);
}

function daysInJalaliMonth(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

function gregorianToJalali(gy, gm, gd) {
  gm = Math.min(Math.max(1, gm), 12);
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
  const jy2 = jy + 1595;
  let days =
    -355668 +
    365 * jy2 +
    Math.floor(jy2 / 33) * 8 +
    Math.floor(((jy2 % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const isLeapG = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal_a = [0, 31, isLeapG ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12; gm++) {
    if (gd <= sal_a[gm]) break;
    gd -= sal_a[gm];
  }
  if (gm > 12) gm = 12;
  return [gy, gm, gd];
}

function isoToJalali(isoDate) {
  const [gy, gm, gd] = isoDate.split("-").map(Number);
  return gregorianToJalali(gy, gm, gd);
}

function jalaliToIso(jy, jm, jd) {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}


const seedProducts = [
  { id: "P1", name: "کاناپه سه‌نفره", category: "مبل", price: 45000000 },
  { id: "P2", name: "مبل راحتی ال‌شکل", category: "مبل", price: 68000000 },
  { id: "P3", name: "صندلی ناهارخوری (ست ۶ عددی)", category: "صندلی", price: 32000000 },
  { id: "P4", name: "مبل کلاسیک هفت‌نفره", category: "مبل", price: 95000000 },
  { id: "P5", name: "تخت‌خواب‌شو", category: "مبل", price: 52000000 },
  { id: "P6", name: "میز جلومبلی", category: "میز وسط", price: 18000000 },
  { id: "P7", name: "میز ناهارخوری", category: "میز ناهارخوری", price: 27000000 },
];

function emptyProduction() {
  return { carpentry: false, zirkar: false, rangkar: false, tailor: false, ruyekoob: false };
}
function fullProduction() {
  return { carpentry: true, zirkar: true, rangkar: true, tailor: true, ruyekoob: true };
}

const seedOrders = [
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
    production: { carpentry: true, zirkar: false, rangkar: true, tailor: false, ruyekoob: false }, delivered: false, notes: "",
  },
  {
    id: "SF-1029", customer: "فروشگاه رویا",
    items: [{ productId: "P1", productName: "کاناپه سه‌نفره", unitPrice: 45000000, qty: 1, fabricColor: "", woodColor: "" }],
    requested: daysFromNow(6), createdAt: daysAgo(12), registeredAt: daysAgo(12) + "T14:40:00",
    production: emptyProduction(), delivered: false, notes: "",
  },
  {
    id: "SF-1030", customer: "دکوراسیون ماهور",
    items: [
      { productId: "P4", productName: "مبل کلاسیک هفت‌نفره", unitPrice: 95000000, qty: 1, fabricColor: "چرم مصنوعی مشکی", woodColor: "راش روشن" },
      { productId: "P6", productName: "میز جلومبلی", unitPrice: 18000000, qty: 1, fabricColor: "", woodColor: "راش روشن" },
    ],
    requested: daysFromNow(0), createdAt: daysAgo(9), registeredAt: daysAgo(9) + "T08:50:00",
    production: { carpentry: true, zirkar: true, rangkar: true, tailor: true, ruyekoob: true }, delivered: false, notes: "",
  },
  {
    id: "SF-1031", customer: "بوتیک مبلمان الوند",
    items: [{ productId: "P1", productName: "کاناپه سه‌نفره", unitPrice: 45000000, qty: 2, fabricColor: "مخمل زرشکی", woodColor: "" }],
    requested: daysFromNow(3), createdAt: daysAgo(15), registeredAt: daysAgo(15) + "T16:20:00",
    production: { carpentry: true, zirkar: true, rangkar: false, tailor: true, ruyekoob: false }, delivered: false, notes: "",
  },
  {
    id: "SF-1032", customer: "بوتیک مبلمان الوند",
    items: [{ productId: "P2", productName: "مبل راحتی ال‌شکل", unitPrice: 68000000, qty: 1, fabricColor: "", woodColor: "" }],
    requested: daysFromNow(5), createdAt: daysAgo(18), registeredAt: daysAgo(18) + "T10:10:00",
    production: { carpentry: true, zirkar: false, rangkar: false, tailor: false, ruyekoob: false }, delivered: false, notes: "",
  },
  {
    id: "SF-1033", customer: "دکوراسیون ماهور",
    items: [{ productId: "P3", productName: "صندلی ناهارخوری (ست ۶ عددی)", unitPrice: 32000000, qty: 1, fabricColor: "", woodColor: "" }],
    requested: daysFromNow(1), createdAt: daysAgo(5), registeredAt: daysAgo(5) + "T12:35:00",
    production: emptyProduction(), delivered: false, notes: "",
  },
  {
    id: "SF-1035", customer: "فروشگاه چوب و راحتی",
    items: [{ productId: "P2", productName: "مبل راحتی ال‌شکل", unitPrice: 68000000, qty: 1, fabricColor: "", woodColor: "" }],
    requested: daysFromNow(9), createdAt: daysAgo(2), registeredAt: daysAgo(2) + "T09:05:00",
    production: { carpentry: false, zirkar: false, rangkar: false, tailor: true, ruyekoob: false }, delivered: false, notes: "",
  },
  {
    id: "SF-1037", customer: "دکوراسیون ماهور",
    items: [{ productId: "P3", productName: "صندلی ناهارخوری (ست ۶ عددی)", unitPrice: 32000000, qty: 1, fabricColor: "چرم قهوه‌ای", woodColor: "راش تیره" }],
    requested: daysFromNow(2), createdAt: daysAgo(22), registeredAt: daysAgo(22) + "T13:50:00",
    production: { carpentry: true, zirkar: true, rangkar: true, tailor: true, ruyekoob: false }, delivered: false, notes: "",
  },
];

function faDate(dateStr) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long" }).format(new Date(dateStr + "T00:00:00"));
  } catch {
    return dateStr;
  }
}
function faTime(isoStr) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(isoStr));
  } catch {
    return "";
  }
}
function faNum(n) {
  return Number(n).toLocaleString("fa-IR");
}
function faDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}
function faPrice(n) {
  return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}
function daysLeft(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

function statusOf(order) {
  if (order.delivered) return { text: "تحویل شده", tone: "blue" };
  const created = new Date((order.createdAt || order.requested) + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const elapsed = Math.round((now - created) / 86400000);
  if (elapsed <= 0) return { text: "امروز ثبت شد", tone: "sage" };
  if (elapsed > 30) return { text: `${faNum(elapsed - 30)} روز تأخیر`, tone: "brick" };
  if (elapsed <= 10) return { text: `روز ${faNum(elapsed)} از ۳۰`, tone: "sage" };
  if (elapsed <= 20) return { text: `روز ${faNum(elapsed)} از ۳۰`, tone: "brass" };
  return { text: `روز ${faNum(elapsed)} از ۳۰`, tone: "brick" };
}

function isLastBlocker(production, stationKey) {
  const p = production || emptyProduction();
  if (!["zirkar", "rangkar", "tailor"].includes(stationKey)) return false;
  const trio = { zirkar: p.zirkar, rangkar: p.rangkar, tailor: p.tailor };
  if (trio[stationKey]) return false;
  return Object.keys(trio)
    .filter((k) => k !== stationKey)
    .every((k) => trio[k]);
}

function currentStationText(o) {
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

function sanitizeItems(o) {
  const legacyFabric = typeof o.fabricColor === "string" ? o.fabricColor : "";
  const legacyWood = typeof o.woodColor === "string" ? o.woodColor : "";
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items
      .filter((it) => it && typeof it === "object")
      .map((it) => ({
        productId: typeof it.productId === "string" ? it.productId : "",
        productName: typeof it.productName === "string" && it.productName ? it.productName : "نامشخص",
        unitPrice: Number.isFinite(Number(it.unitPrice)) ? Number(it.unitPrice) : 0,
        qty: Number.isFinite(Number(it.qty)) && Number(it.qty) > 0 ? Number(it.qty) : 1,
        fabricColor: typeof it.fabricColor === "string" ? it.fabricColor : legacyFabric,
        woodColor: typeof it.woodColor === "string" ? it.woodColor : legacyWood,
      }));
  }
  // legacy single-product orders saved before multi-item support
  if (typeof o.productName === "string" && o.productName) {
    return [
      {
        productId: typeof o.productId === "string" ? o.productId : "",
        productName: o.productName,
        unitPrice: Number.isFinite(Number(o.unitPrice)) ? Number(o.unitPrice) : 0,
        qty: Number.isFinite(Number(o.qty)) && Number(o.qty) > 0 ? Number(o.qty) : 1,
        fabricColor: legacyFabric,
        woodColor: legacyWood,
      },
    ];
  }
  return [];
}

function sanitizeOrders(list) {
  if (!Array.isArray(list)) return seedOrders;
  return list
    .filter((o) => o && typeof o === "object")
    .map((o, i) => {
      const p = o.production && typeof o.production === "object" ? o.production : {};
      return {
        id: typeof o.id === "string" && /^SF-\d+$/.test(o.id) ? o.id : `SF-${2000 + i}`,
        customer: typeof o.customer === "string" && o.customer.trim() ? o.customer : "بدون نام",
        items: sanitizeItems(o),
        requested: typeof o.requested === "string" && o.requested ? o.requested : daysFromNow(14),
        createdAt: typeof o.createdAt === "string" && o.createdAt ? o.createdAt : (typeof o.requested === "string" ? o.requested : daysAgo(0)),
        registeredAt: typeof o.registeredAt === "string" && o.registeredAt ? o.registeredAt : null,
        production: {
          carpentry: !!p.carpentry,
          zirkar: !!p.zirkar,
          rangkar: !!p.rangkar,
          tailor: !!p.tailor,
          ruyekoob: !!p.ruyekoob,
        },
        delivered: !!o.delivered,
        deliveredAt: typeof o.deliveredAt === "string" ? o.deliveredAt : null,
        notes: typeof o.notes === "string" ? o.notes : "",
      };
    });
}

function orderTotals(o) {
  const items = o.items || [];
  const qty = items.reduce((sum, it) => sum + it.qty, 0);
  const price = items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
  const summary = items.map((it) => `${it.productName} × ${faNum(it.qty)}`).join("، ");
  return { qty, price, summary };
}


function sanitizeProducts(list) {
  if (!Array.isArray(list)) return seedProducts;
  return list
    .filter((p) => p && typeof p === "object")
    .map((p, i) => ({
      id: typeof p.id === "string" && p.id ? p.id : `P${100 + i}`,
      name: typeof p.name === "string" && p.name.trim() ? p.name : "بدون نام",
      category: CATEGORIES.includes(p.category) ? p.category : CATEGORIES[0],
      price: Number.isFinite(Number(p.price)) && Number(p.price) >= 0 ? Number(p.price) : 0,
    }));
}

const tone = {
  sage: "bg-[#16A34A] text-white border border-[#15803D]",
  brass: "bg-[#D97706] text-white border border-[#B45309]",
  brick: "bg-[#DC2626] text-white border border-[#B91C1C]",
  blue: "bg-[#2563EB] text-white border border-[#1D4ED8]",
  neutral: "bg-[#EDE6D6] text-[#6B5E4F] border border-[#D9CDB6]",
};

const accentBorder = {
  sage: "border-r-4 border-r-[#16A34A]",
  brass: "border-r-4 border-r-[#D97706]",
  brick: "border-r-4 border-r-[#DC2626]",
  blue: "border-r-4 border-r-[#2563EB]",
  neutral: "border-r-4 border-r-[#D9CDB6]",
};

const fullBorder = {
  sage: "border-[#16A34A]",
  brass: "border-[#D97706]",
  brick: "border-[#DC2626]",
  blue: "border-[#2563EB]",
  neutral: "border-[#D9CDB6]",
};

const toneColor = {
  sage: "#16A34A",
  brass: "#D97706",
  brick: "#DC2626",
  blue: "#2563EB",
  neutral: "#D9CDB6",
};

function safeJalaliParts(isoLike) {
  try {
    const safeIso = isoLike && /^\d{4}-\d{2}-\d{2}$/.test(isoLike) ? isoLike : daysAgo(0);
    const parts = isoToJalali(safeIso);
    if (parts.some((n) => !Number.isFinite(n))) throw new Error("bad jalali parts");
    if (parts[1] < 1 || parts[1] > 12) throw new Error("bad month");
    return parts;
  } catch {
    return isoToJalali(daysAgo(0));
  }
}

function JalaliDateInput({ value, onChange, className }) {
  const [jy, jm, jd] = safeJalaliParts(value);
  const maxDay = daysInJalaliMonth(jy, jm) || 29;

  const set = (ny, nm, nd) => {
    try {
      const clampedD = Math.min(Math.max(1, nd), daysInJalaliMonth(ny, nm) || 29);
      const iso = jalaliToIso(ny, nm, clampedD);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(new Date(iso + "T00:00:00").getTime())) {
        throw new Error("bad iso result");
      }
      onChange(iso);
    } catch {
      onChange(daysAgo(0));
    }
  };

  const years = [];
  for (let y = jy - 2; y <= jy + 3; y++) years.push(y);

  const selectCls =
    "rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-2 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]";

  return (
    <div className={"flex gap-1.5 " + (className || "")}>
      <select value={jd} onChange={(e) => set(jy, jm, Number(e.target.value))} className={selectCls + " w-16"}>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{faNum(d)}</option>
        ))}
      </select>
      <select value={jm} onChange={(e) => set(jy, Number(e.target.value), jd)} className={selectCls + " flex-1"}>
        {JALALI_MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select value={jy} onChange={(e) => set(Number(e.target.value), jm, jd)} className={selectCls + " w-20"}>
        {years.map((y) => (
          <option key={y} value={y}>{faDigits(y)}</option>
        ))}
      </select>
    </div>
  );
}

export default function MizanCoordinator() {
  const [view, setView] = useState("store");

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const productsRef = useRef(products);
  productsRef.current = products;

  const [syncError, setSyncError] = useState(false);
  const [toast, setToast] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [highlightId, setHighlightId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState(null);
  const [resetArmed, setResetArmed] = useState(false);

  const [form, setForm] = useState({
    customer: "",
    orderDate: daysAgo(0),
    requested: daysFromNow(14),
    notes: "",
  });
  const [cartItems, setCartItems] = useState([]);
  const cartItemsRef = useRef(cartItems);
  cartItemsRef.current = cartItems;
  const [pickProductId, setPickProductId] = useState("");
  const [pickQty, setPickQty] = useState(1);
  const [pickFabricColor, setPickFabricColor] = useState("");
  const [pickWoodColor, setPickWoodColor] = useState("");

  const [productForm, setProductForm] = useState({ name: "", category: CATEGORIES[0], price: "" });

  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // ---- load orders ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (cancelled) return;
        if (res && res.value) {
          setOrders(sanitizeOrders(JSON.parse(res.value)));
        } else {
          await window.storage.set(STORAGE_KEY, JSON.stringify(seedOrders), true);
          if (!cancelled) setOrders(seedOrders);
        }
      } catch {
        try {
          await window.storage.set(STORAGE_KEY, JSON.stringify(seedOrders), true);
          if (!cancelled) setOrders(seedOrders);
        } catch {
          if (!cancelled) {
            setOrders(seedOrders);
            setSyncError(true);
          }
        }
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- load products ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(PRODUCTS_KEY, true);
        if (cancelled) return;
        if (res && res.value) {
          setProducts(sanitizeProducts(JSON.parse(res.value)));
        } else {
          await window.storage.set(PRODUCTS_KEY, JSON.stringify(seedProducts), true);
          if (!cancelled) setProducts(seedProducts);
        }
      } catch {
        try {
          await window.storage.set(PRODUCTS_KEY, JSON.stringify(seedProducts), true);
          if (!cancelled) setProducts(seedProducts);
        } catch {
          if (!cancelled) setProducts(seedProducts);
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // default the item picker's product once products are ready
  useEffect(() => {
    if (!productsLoading && products.length && !pickProductId) {
      setPickProductId(products[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoading, products]);

  // ---- poll for teammates' changes ----
  useEffect(() => {
    if (ordersLoading) return;
    const id = window.setInterval(async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (res && res.value) {
          const fresh = JSON.stringify(JSON.parse(res.value));
          if (fresh !== JSON.stringify(ordersRef.current)) {
            setOrders(sanitizeOrders(JSON.parse(fresh)));
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [ordersLoading]);

  useEffect(() => {
    if (productsLoading) return;
    const id = window.setInterval(async () => {
      try {
        const res = await window.storage.get(PRODUCTS_KEY, true);
        if (res && res.value) {
          const fresh = JSON.stringify(JSON.parse(res.value));
          if (fresh !== JSON.stringify(productsRef.current)) {
            setProducts(sanitizeProducts(JSON.parse(fresh)));
          }
        }
      } catch {
        // ignore
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [productsLoading]);

  const saveOrders = async (updater) => {
    const next = typeof updater === "function" ? updater(ordersRef.current) : updater;
    setOrders(next);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next), true);
    } catch {
      setSyncError(true);
    }
  };

  const saveProducts = async (updater) => {
    const next = typeof updater === "function" ? updater(productsRef.current) : updater;
    setProducts(next);
    try {
      await window.storage.set(PRODUCTS_KEY, JSON.stringify(next), true);
    } catch {
      setSyncError(true);
    }
  };

  const flash = (id) => {
    setHighlightId(id);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setHighlightId(null), 2200);
  };

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(""), 2600);
  };

  const showError = (msg) => {
    setErrorMsg(msg);
    window.clearTimeout(showError._t);
    showError._t = window.setTimeout(() => setErrorMsg(""), 3500);
  };

  const nextId = () => {
    const nums = orders
      .map((o) => {
        const m = typeof o.id === "string" ? /^SF-(\d+)$/.exec(o.id) : null;
        return m ? parseInt(m[1], 10) : NaN;
      })
      .filter((n) => Number.isFinite(n));
    const base = nums.length ? Math.max(...nums) : 2000;
    return `SF-${base + 1}`;
  };

  const addCartItem = () => {
    const product = products.find((p) => p.id === pickProductId);
    if (!product) {
      showError("یه مدل از لیست انتخاب کن");
      return;
    }
    const qty = Number(pickQty) > 0 ? Number(pickQty) : 1;
    const fabricColor = pickFabricColor.trim();
    const woodColor = pickWoodColor.trim();
    setCartItems((prev) => {
      const idx = prev.findIndex(
        (it) => it.productId === product.id && it.fabricColor === fabricColor && it.woodColor === woodColor
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      }
      return [
        ...prev,
        { productId: product.id, productName: product.name, unitPrice: product.price, qty, fabricColor, woodColor },
      ];
    });
    setPickQty(1);
    setPickFabricColor("");
    setPickWoodColor("");
    try {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
    } catch {
      /* ignore */
    }
  };

  const removeCartItem = (productId, fabricColor, woodColor) => {
    setCartItems((prev) =>
      prev.filter(
        (it) => !(it.productId === productId && it.fabricColor === fabricColor && it.woodColor === woodColor)
      )
    );
  };

  const submitOrder = (e, ready) => {
    try {
      if (e && e.preventDefault) e.preventDefault();
      if (ordersLoading) return;
      const customerName = (form.customer || "").trim();
      if (!customerName) {
        showError("نام مشتری رو وارد کن");
        return;
      }
      const currentCart = cartItemsRef.current;
      if (currentCart.length === 0) {
        showError("حداقل یه مدل به سفارش اضافه کن");
        return;
      }
      const id = nextId();
      const today = daysAgo(0);
      const newOrder = {
        id,
        customer: customerName,
        items: currentCart,
        requested: form.requested || daysFromNow(14),
        createdAt: form.orderDate || today,
        registeredAt: new Date().toISOString(),
        production: ready ? fullProduction() : emptyProduction(),
        delivered: false,
        deliveredAt: null,
        notes: (form.notes || "").trim(),
      };
      const nextOrders = [newOrder, ...ordersRef.current];
      setOrders(nextOrders);
      window.storage
        .set(STORAGE_KEY, JSON.stringify(nextOrders), true)
        .catch(() => setSyncError(true));
      setForm({
        customer: "",
        orderDate: daysAgo(0),
        requested: daysFromNow(14),
        notes: "",
      });
      setCartItems([]);
      showToast(
        ready
          ? `سفارش ${id} به‌عنوان آماده ثبت شد و توی «تحویل نهایی» کارگاه منتظره`
          : `سفارش ${id} ثبت شد و به کارگاه ارسال شد`
      );
      flash(id);
    } catch {
      showError("ثبت سفارش با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const advanceProduction = (id, key) => {
    try {
      const stationLabel = (STATIONS.find((s) => s.key === key) || {}).label || key;
      let nextMsg = "";
      saveOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const updated = { ...o, production: { ...o.production, [key]: true } };
          const p = updated.production;
          if (p.zirkar && p.rangkar && p.tailor) {
            nextMsg = "آماده‌ی رویه‌کوب شد";
          } else {
            const waiting = [];
            if (p.carpentry && !p.zirkar) waiting.push("زیرکار");
            if (p.carpentry && !p.rangkar) waiting.push("رنگکار");
            if (!p.carpentry) waiting.push("نجاری");
            if (!p.tailor) waiting.push("خیاط");
            nextMsg = waiting.length ? `منتظر ${waiting.join(" و ")}` : "";
          }
          return updated;
        })
      );
      showToast(`${stationLabel} سفارش ${id} تمام شد${nextMsg ? " — " + nextMsg : ""}`);
      flash(id);
    } catch {
      showError("ثبت مرحله با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const deliver = (id) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      saveOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, delivered: true, deliveredAt: today } : o))
      );
      showToast(`سفارش ${id} تحویل داده شد`);
    } catch {
      showError("ثبت تحویل با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const deleteOrder = (id) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      window.clearTimeout(deleteOrder._t);
      deleteOrder._t = window.setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }
    setConfirmDeleteId(null);
    try {
      saveOrders((prev) => prev.filter((o) => o.id !== id));
      showToast(`سفارش ${id} حذف شد`);
    } catch {
      showError("حذف سفارش با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const jumpToOrder = (id) => {
    setView("workshop");
    flash(id);
  };

  const resetDemoData = () => {
    if (!resetArmed) {
      setResetArmed(true);
      window.clearTimeout(resetDemoData._t);
      resetDemoData._t = window.setTimeout(() => setResetArmed(false), 3000);
      return;
    }
    setResetArmed(false);
    saveOrders(seedOrders);
    saveProducts(seedProducts);
    showToast("داده‌ها به حالت نمونه بازنشانی شد");
  };

  // ---- product catalog actions ----
  const nextProductId = () => {
    const nums = products
      .map((p) => {
        const m = /^P(\d+)$/.exec(p.id || "");
        return m ? parseInt(m[1], 10) : NaN;
      })
      .filter((n) => Number.isFinite(n));
    const base = nums.length ? Math.max(...nums) : 100;
    return `P${base + 1}`;
  };

  const submitProduct = (e) => {
    e.preventDefault();
    const name = productForm.name.trim();
    if (!name) {
      showError("نام محصول رو وارد کن");
      return;
    }
    const price = Number(productForm.price) >= 0 ? Number(productForm.price) : 0;
    try {
      const id = nextProductId();
      saveProducts((prev) => [...prev, { id, name, category: productForm.category, price }]);
      setProductForm({ name: "", category: CATEGORIES[0], price: "" });
      showToast(`محصول «${name}» اضافه شد`);
    } catch {
      showError("افزودن محصول با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  const deleteProduct = (id) => {
    if (confirmDeleteProductId !== id) {
      setConfirmDeleteProductId(id);
      window.clearTimeout(deleteProduct._t);
      deleteProduct._t = window.setTimeout(() => setConfirmDeleteProductId(null), 3000);
      return;
    }
    setConfirmDeleteProductId(null);
    try {
      saveProducts((prev) => prev.filter((p) => p.id !== id));
      showToast("محصول حذف شد");
    } catch {
      showError("حذف محصول با خطا مواجه شد — دوباره امتحان کن");
    }
  };

  // ---- derived data ----
  const ledger = useMemo(() => {
    return [...orders].sort((a, b) => {
      if (a.delivered !== b.delivered) return a.delivered ? 1 : -1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [orders]);

  const historyList = useMemo(() => {
    return orders
      .filter((o) => o.delivered)
      .filter((o) => {
        if (historyQuery.trim() && !o.customer.toLowerCase().includes(historyQuery.trim().toLowerCase())) {
          return false;
        }
        const d = o.deliveredAt || o.requested;
        if (historyFrom && d < historyFrom) return false;
        if (historyTo && d > historyTo) return false;
        return true;
      })
      .sort((a, b) => (b.deliveredAt || b.requested).localeCompare(a.deliveredAt || a.requested));
  }, [orders, historyQuery, historyFrom, historyTo]);

  const stationOrders = useMemo(() => {
    const groups = { carpentry: [], zirkar: [], rangkar: [], tailor: [], ruyekoob: [], final: [] };
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
  }, [orders]);

  const bottlenecks = STATIONS.filter((s) => (stationOrders[s.key] || []).length / s.capacity >= 1);

  const loading = ordersLoading || productsLoading;

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-[#EDE6D6] text-[#2B2420]"
      style={{ fontFamily: "'Vazirmatn', 'Tahoma', sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <header className="bg-[#3B241A] text-[#F3EEE1]">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xl font-bold tracking-tight">میزان</div>
            <div className="text-xs text-[#C9B79E] mt-0.5">هماهنگی فروش و تولید مبل — نسخه v43</div>
          </div>
          <nav className="flex flex-wrap rounded-lg bg-[#2C1B13] p-1 gap-0.5">
            {[
              ["store", "فروشگاه"],
              ["workshop", "کارگاه تولید"],
              ["products", "محصولات"],
              ["history", "تاریخچه"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={
                  "px-3.5 py-1.5 text-sm rounded-md transition-colors " +
                  (view === key ? "bg-[#9C7A3C] text-[#2B2420] font-semibold" : "text-[#D9CDB6]")
                }
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5">
        <div className="mt-4 text-xs text-[#6B5E4F] bg-[#E4DCC8] border border-[#D9CDB6] rounded-lg px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span>این اطلاعات بین هر کسی که این لینک رو داشته باشه مشترکه و زنده همگام می‌شه — فعلاً بدون ورود جدا برای هر نفر.</span>
          <button
            onClick={resetDemoData}
            className={
              "shrink-0 text-xs px-2.5 py-1 rounded-md border transition-colors " +
              (resetArmed
                ? "border-[#E3B6AC] bg-[#F3DFDA] text-[#8A3C2F] font-semibold"
                : "border-[#D9CDB6] text-[#6B5E4F] hover:text-[#3B241A]")
            }
          >
            {resetArmed ? "برای تأیید دوباره بزن" : "بازنشانی داده‌های نمونه"}
          </button>
        </div>
        {syncError && (
          <div className="mt-2 text-xs text-[#8A3C2F] bg-[#F3DFDA] border border-[#E3B6AC] rounded-lg px-4 py-2">
            ذخیره‌سازی مشترک الان در دسترس نیست — تغییرات فقط روی همین صفحه می‌مونه.
          </div>
        )}
      </div>

      {toast && (
        <div className="mx-auto max-w-6xl px-5">
          <div className="mt-4 text-sm bg-[#16A34A] text-white rounded-lg px-4 py-2.5 flex items-center gap-2">
            <CheckCircle2 size={16} />
            {toast}
          </div>
        </div>
      )}
      {errorMsg && (
        <div className="mx-auto max-w-6xl px-5">
          <div className="mt-4 text-sm bg-[#DC2626] text-white rounded-lg px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle size={16} />
            {errorMsg}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-5 py-8">
        {loading ? (
          <div className="text-center py-24 text-sm text-[#6B5E4F]">در حال بارگذاری اطلاعات مشترک…</div>
        ) : view === "store" ? (
          <div className="flex flex-col gap-6">
            {/* New order form */}
            <section>
              <div className="rounded-xl border border-[#D9CDB6] bg-[#F7F2E7] p-5 shadow-sm">
                <h2 className="text-sm font-bold mb-3">ثبت سفارش جدید</h2>

                <form onSubmit={submitOrder} className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                        نام مشتری
                        <input
                          value={form.customer}
                          onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))}
                          placeholder="مثلاً بوتیک مبلمان الوند"
                          className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                        تاریخ سفارش
                        <JalaliDateInput
                          value={form.orderDate}
                          onChange={(iso) => setForm((f) => ({ ...f, orderDate: iso }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                        تاریخ تحویل
                        <JalaliDateInput
                          value={form.requested}
                          onChange={(iso) => setForm((f) => ({ ...f, requested: iso }))}
                        />
                      </label>

                      <div className="rounded-lg bg-[#EDE6D6] p-3.5">
                        <div className="text-xs text-[#6B5E4F] mb-2">افزودن مدل به این سفارش</div>
                        <div className="flex flex-col gap-3">
                          <label className="flex-1 flex flex-col gap-1 text-xs text-[#6B5E4F]">
                            مدل
                            <select
                              value={pickProductId}
                              onChange={(e) => setPickProductId(e.target.value)}
                              className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                            تعداد
                            <input
                              type="number"
                              min={1}
                              value={pickQty}
                              onChange={(e) => setPickQty(e.target.value)}
                              className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C] w-24"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                            رنگ پارچه (برای همین مدل)
                            <input
                              value={pickFabricColor}
                              onChange={(e) => setPickFabricColor(e.target.value)}
                              placeholder="مثلاً مخمل زرشکی"
                              className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                            رنگ / نوع چوب (برای همین مدل)
                            <input
                              value={pickWoodColor}
                              onChange={(e) => setPickWoodColor(e.target.value)}
                              placeholder="مثلاً راش تیره"
                              className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={addCartItem}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                              width: "100%",
                              backgroundColor: "#9C7A3C",
                              color: "#FFFFFF",
                              fontSize: "14px",
                              fontWeight: 500,
                              padding: "10px 20px",
                              borderRadius: "8px",
                              border: "none",
                            }}
                          >
                            <Plus size={15} />
                            افزودن به سفارش
                          </button>
                        </div>

                        {cartItems.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1.5">
                            {cartItems.map((it, idx) => (
                              <div
                                key={it.productId + "-" + idx}
                                className="flex items-center justify-between bg-[#F7F2E7] rounded-lg px-3 py-2 text-sm"
                              >
                                <div>
                                  <div>{it.productName} × {faNum(it.qty)}</div>
                                  {(it.fabricColor || it.woodColor) && (
                                    <div className="text-xs text-[#8A7B60] mt-0.5">
                                      {[it.fabricColor && `پارچه: ${it.fabricColor}`, it.woodColor && `چوب: ${it.woodColor}`]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-[#6B5E4F]">{faPrice(it.unitPrice * it.qty)} تومان</span>
                                  <button
                                    type="button"
                                    onClick={() => removeCartItem(it.productId, it.fabricColor, it.woodColor)}
                                    className="text-[#8A7B60] hover:text-[#8A3C2F]"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                        توضیحات بیشتر
                        <textarea
                          rows={2}
                          value={form.notes}
                          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                          className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none resize-none focus:border-[#9C7A3C]"
                        />
                      </label>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="submit"
                      onClick={submitOrder}
                      className="self-start flex items-center justify-center gap-1.5 rounded-lg bg-[#3B241A] text-[#F3EEE1] text-sm font-medium py-2.5 px-6 hover:bg-[#4A2E22] transition-colors"
                    >
                      <Plus size={15} />
                      ثبت سفارش
                    </button>
                    <button
                      type="button"
                      onClick={(e) => submitOrder(e, true)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        backgroundColor: "#2563EB",
                        color: "#FFFFFF",
                        fontSize: "14px",
                        fontWeight: 500,
                        padding: "10px 20px",
                        borderRadius: "8px",
                        border: "none",
                      }}
                      title="برای اجناس آماده‌ی نمایشگاه — مراحل تولید رو رد می‌کنه و می‌ره توی «تحویل نهایی» کارگاه"
                    >
                      <CheckCircle2 size={15} />
                      ثبت سفارش آماده
                    </button>
                    {toast && (
                      <span className="text-sm text-[#16A34A] font-medium flex items-center gap-1">
                        <CheckCircle2 size={15} />
                        {toast}
                      </span>
                    )}
                    {errorMsg && (
                      <span className="text-sm text-[#DC2626] font-medium flex items-center gap-1">
                        <AlertTriangle size={15} />
                        {errorMsg}
                      </span>
                    )}
                  </div>
                </form>
              </div>
            </section>

            {/* Ledger */}
            <section>
              <h1 className="text-lg font-bold mb-1">سفارش‌های فروشگاه</h1>
              <p className="text-sm text-[#6B5E4F] mb-4">جدیدترین سفارش بالای لیست — قیمت فقط اینجا نشون داده می‌شه</p>

              <div className="rounded-xl border border-[#D9CDB6] overflow-hidden bg-[#F7F2E7]">
                {ledger.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-[#8A7B60]">هنوز سفارشی ثبت نشده</div>
                )}
                {ledger.map((o) => {
                  const st = statusOf(o);
                  const totals = orderTotals(o);
                  return (
                    <div
                      key={o.id}
                      style={{ borderRightWidth: "5px", borderRightColor: toneColor[st.tone], borderRightStyle: "solid" }}
                      className={
                        "px-4 py-3 border-b border-[#E4DCC8] last:border-0 transition-colors " +
                        (highlightId === o.id ? "bg-[#F0E4C8]" : "")
                      }
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium">{o.customer}</span>
                        <span
                          style={{ backgroundColor: toneColor[st.tone], color: "#FFFFFF" }}
                          className="text-xs px-2 py-1 rounded-full font-medium"
                        >
                          {st.text}
                        </span>
                      </div>
                      <div className="text-xs text-[#6B5E4F] mb-1">
                        {o.id} — {totals.summary}
                      </div>
                      <div className="text-xs text-[#6B5E4F] mb-2">
                        {faPrice(totals.price)} تومان
                        {o.items.some((it) => it.fabricColor || it.woodColor) && (
                          <span>
                            {" · "}
                            {o.items
                              .filter((it) => it.fabricColor || it.woodColor)
                              .map((it) => `${it.productName}: ${[it.fabricColor, it.woodColor].filter(Boolean).join(" / ")}`)
                              .join("، ")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-4 text-xs text-[#6B5E4F]">
                          <span>
                            ثبت سفارش: {faDate(o.createdAt)}
                            {o.registeredAt && ` — ساعت ${faTime(o.registeredAt)}`}
                          </span>
                          <span>تحویل: {faDate(o.requested)}</span>
                          <span className="text-[#8A7B60]">{currentStationText(o)}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => jumpToOrder(o.id)}
                            className="text-xs text-[#7A5E28] hover:text-[#5C4620] flex items-center gap-1"
                          >
                            کارگاه
                            <ArrowUpLeft size={13} />
                          </button>
                          <button
                            onClick={() => deleteOrder(o.id)}
                            title={confirmDeleteId === o.id ? "برای حذف قطعی دوباره بزن" : "حذف سفارش"}
                            className={
                              "flex items-center gap-1 transition-colors " +
                              (confirmDeleteId === o.id
                                ? "text-[#8A3C2F] font-semibold"
                                : "text-[#8A7B60] hover:text-[#8A3C2F]")
                            }
                          >
                            <Trash2 size={14} />
                            {confirmDeleteId === o.id && <span className="text-[10px]">دوباره بزن</span>}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : view === "workshop" ? (
          <div>
            <h1 className="text-lg font-bold mb-1">خط تولید</h1>
            <p className="text-sm text-[#6B5E4F] mb-4">نجاری به زیرکار و رنگکار جدا می‌شه؛ خیاط مستقیم می‌ره پیش رویه‌کوب</p>

            {bottlenecks.length > 0 && (
              <div className="mb-5 flex items-center gap-2 text-sm bg-[#DC2626] text-white rounded-lg px-4 py-2.5">
                <AlertTriangle size={16} />
                {bottlenecks.map((s) => s.label).join(" و ")} از ظرفیت پر شده — سفارش‌های جدید ممکن است دیر برسند
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {STATIONS.map((s) => {
                const count = (stationOrders[s.key] || []).length;
                const ratio = count / s.capacity;
                const barTone = ratio >= 1 ? "#DC2626" : ratio >= 0.6 ? "#D97706" : "#16A34A";
                const Icon = s.icon;
                return (
                  <div key={s.key} className="rounded-xl border border-[#D9CDB6] bg-[#F7F2E7] p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <Icon size={16} className="text-[#6B5E4F]" />
                      <span className="text-xs font-medium">{s.label}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#E4DCC8] overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: barTone }}
                      />
                    </div>
                    <span className="text-xs text-[#6B5E4F]">{faNum(count)} از {faNum(s.capacity)} ظرفیت</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {STATIONS.map((s) => {
                const Icon = s.icon;
                const list = stationOrders[s.key] || [];
                return (
                  <div key={s.key} className="rounded-xl bg-[#E4DCC8] p-3 min-h-[140px]">
                    <div className="flex items-center gap-1.5 px-1 mb-3 text-sm font-semibold text-[#4A2E22]">
                      <Icon size={15} />
                      {s.label}
                      <span className="text-xs font-normal text-[#6B5E4F]">({faNum(list.length)})</span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {list.length === 0 && (
                        <div className="rounded-lg border border-dashed border-[#C4B896] px-3 py-6 text-center text-xs text-[#8A7B60]">
                          سفارشی در این مرحله نیست
                        </div>
                      )}
                      {list.map((o) => {
                        const st = statusOf(o);
                        const totals = orderTotals(o);
                        const lastBlocker = isLastBlocker(o.production, s.key);
                        return (
                          <div
                            key={o.id}
                            style={{
                              borderWidth: lastBlocker ? "3px" : "2px",
                              borderColor: lastBlocker ? "#8B5CF6" : toneColor[st.tone],
                              borderStyle: "solid",
                              backgroundColor: lastBlocker ? "#F3E8FF" : "#F7F2E7",
                            }}
                            className={
                              "rounded-lg p-3 transition-shadow " +
                              (highlightId === o.id ? "ring-2 ring-[#9C7A3C]/40" : "")
                            }
                          >
                            {lastBlocker && (
                              <div style={{ color: "#7C3AED", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                فقط منتظر همینه — بقیه آماده‌ست
                              </div>
                            )}
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-[#6B5E4F]">{o.id}</span>
                              <div className="flex items-center gap-2">
                                <span
                                  style={{ backgroundColor: toneColor[st.tone], color: "#FFFFFF" }}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                >
                                  {st.text}
                                </span>
                                <button
                                  onClick={() => deleteOrder(o.id)}
                                  title={confirmDeleteId === o.id ? "برای حذف قطعی دوباره بزن" : "حذف سفارش"}
                                  className={
                                    "transition-colors " +
                                    (confirmDeleteId === o.id
                                      ? "text-[#8A3C2F] font-semibold"
                                      : "text-[#8A7B60] hover:text-[#8A3C2F]")
                                  }
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            <div className="text-sm font-medium mb-0.5">{o.customer}</div>
                            <div className="text-xs text-[#6B5E4F] mb-1">{totals.summary}</div>
                            <div className="text-xs text-[#6B5E4F] mb-2">تحویل: {faDate(o.requested)}</div>
                            {o.items.some((it) => it.fabricColor || it.woodColor) && (
                              <div className="text-[11px] text-[#8A7B60] mb-2">
                                {o.items
                                  .filter((it) => it.fabricColor || it.woodColor)
                                  .map(
                                    (it) =>
                                      `${it.productName}: ${[it.fabricColor && `پارچه ${it.fabricColor}`, it.woodColor && `چوب ${it.woodColor}`]
                                        .filter(Boolean)
                                        .join(" / ")}`
                                  )
                                  .join(" · ")}
                              </div>
                            )}
                            {o.notes && <div className="text-[11px] text-[#8A7B60] mb-2">{o.notes}</div>}
                            {s.key !== "final" ? (
                              <button
                                onClick={() => advanceProduction(o.id, s.key)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "4px",
                                  width: "100%",
                                  backgroundColor: "#3B241A",
                                  color: "#F3EEE1",
                                  fontSize: "12px",
                                  padding: "6px",
                                  borderRadius: "6px",
                                  border: "none",
                                }}
                              >
                                {s.label} تمام شد
                                <CheckCircle2 size={12} />
                              </button>
                            ) : (
                              <button
                                onClick={() => deliver(o.id)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "4px",
                                  width: "100%",
                                  backgroundColor: "#16A34A",
                                  color: "#FFFFFF",
                                  fontSize: "12px",
                                  padding: "6px",
                                  borderRadius: "6px",
                                  border: "none",
                                }}
                              >
                                ثبت تحویل
                                <CheckCircle2 size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === "products" ? (
          <div className="flex flex-col gap-6">
            <section>
              <div className="rounded-xl border border-[#D9CDB6] bg-[#F7F2E7] p-5 shadow-sm">
                <h2 className="text-sm font-bold mb-4">افزودن مدل جدید</h2>
                <form onSubmit={submitProduct} className="flex flex-col sm:flex-row gap-3.5 items-stretch sm:items-end">
                  <label className="flex-1 flex flex-col gap-1 text-xs text-[#6B5E4F]">
                    نام مدل
                    <input
                      value={productForm.name}
                      onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="مثلاً میز عسلی گرد"
                      className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                    دسته
                    <select
                      value={productForm.category}
                      onChange={(e) => setProductForm((f) => ({ ...f, category: e.target.value }))}
                      className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                    قیمت (تومان)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={productForm.price}
                      onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="۰"
                      className="rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C] w-32"
                    />
                  </label>
                  <button
                    type="submit"
                    onClick={submitProduct}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-[#3B241A] text-[#F3EEE1] text-sm font-medium py-2.5 px-6 hover:bg-[#4A2E22] transition-colors whitespace-nowrap"
                  >
                    <Plus size={15} />
                    افزودن
                  </button>
                </form>
              </div>
            </section>

            <section>
              <h1 className="text-lg font-bold mb-1">مدل‌ها ({faNum(products.length)})</h1>
              <p className="text-sm text-[#6B5E4F] mb-4">تا ۲۰۰ مدل می‌تونی اضافه کنی — قیمت فقط اینجا و توی فروشگاه دیده می‌شه</p>
              <div className="rounded-xl border border-[#D9CDB6] overflow-hidden bg-[#F7F2E7]">
                {products.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-[#8A7B60]">هنوز مدلی اضافه نشده</div>
                )}
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="px-4 py-3 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div>
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-[#6B5E4F]"> · {p.category}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-[#4A2E22] font-medium">{faPrice(p.price)} تومان</span>
                      <button
                        onClick={() => deleteProduct(p.id)}
                        title={confirmDeleteProductId === p.id ? "برای حذف قطعی دوباره بزن" : "حذف مدل"}
                        className={
                          "flex items-center gap-1 transition-colors " +
                          (confirmDeleteProductId === p.id
                            ? "text-[#8A3C2F] font-semibold"
                            : "text-[#8A7B60] hover:text-[#8A3C2F]")
                        }
                      >
                        <Trash2 size={14} />
                        {confirmDeleteProductId === p.id && <span className="text-[10px]">دوباره بزن</span>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div>
            <h1 className="text-lg font-bold mb-1 flex items-center gap-2">
              <History size={18} />
              تاریخچه تحویل
            </h1>
            <p className="text-sm text-[#6B5E4F] mb-4">همه‌ی سفارش‌هایی که تا امروز تحویل داده شده‌اند</p>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <label className="flex-1 flex items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
                <Search size={15} className="text-[#8A7B60]" />
                <input
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="جستجوی نام مشتری"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
                از
                <JalaliDateInput value={historyFrom} onChange={setHistoryFrom} />
                {historyFrom && (
                  <button type="button" onClick={() => setHistoryFrom("")} className="text-[#8A7B60] hover:text-[#8A3C2F]">
                    ×
                  </button>
                )}
              </label>
              <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
                تا
                <JalaliDateInput value={historyTo} onChange={setHistoryTo} />
                {historyTo && (
                  <button type="button" onClick={() => setHistoryTo("")} className="text-[#8A7B60] hover:text-[#8A3C2F]">
                    ×
                  </button>
                )}
              </label>
            </div>

            <div className="rounded-xl border border-[#D9CDB6] overflow-hidden bg-[#F7F2E7]">
              {historyList.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-[#8A7B60]">
                  سفارش تحویل‌شده‌ای با این فیلتر پیدا نشد
                </div>
              )}
              {historyList.map((o) => {
                const totals = orderTotals(o);
                return (
                <div key={o.id} className="px-4 py-3 border-b border-[#E4DCC8] last:border-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium">{o.customer}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-[#2563EB] text-white">
                      تحویل: {o.deliveredAt ? faDate(o.deliveredAt) : "نامشخص"}
                    </span>
                  </div>
                  <div className="text-xs text-[#6B5E4F]">
                    {o.id} — {totals.summary} · ثبت سفارش: {faDate(o.createdAt)}
                    {o.registeredAt && ` — ساعت ${faTime(o.registeredAt)}`}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}