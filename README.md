# Mizan (میزان) — Furniture Sales & Production Coordinator

Mizan connects a furniture **store** (where orders are taken) with the **workshop** (where pieces are built), so both sides see the same orders, the same production status, and the same delivery dates.

The UI is Persian, right-to-left, and uses the Jalali (Persian) calendar.

> **Status:** concept / prototype (`mizan-v43-readytofinal.jsx`), originally built as a single-file React artifact in Claude. This repo is where it gets turned into a real, production-ready app, one part at a time.

---

## 1. What the prototype does today

The app has four tabs.

### 1.1 Store — فروشگاه
- **New order form**
  - Customer name (نام مشتری)
  - Order date (تاریخ سفارش), using a Jalali date picker
  - Requested delivery date (تاریخ تحویل), defaulting to today + 14 days
  - **Cart of models:** each line has a product, quantity, fabric color (رنگ پارچه) and wood color/type (رنگ / نوع چوب). The same product with the same colors merges into one line.
  - Notes (توضیحات بیشتر)
  - Two submit buttons:
    - **ثبت سفارش (Register order):** goes into production with all stages empty.
    - **ثبت سفارش آماده (Register ready order):** for showroom stock. It skips production and goes straight to *Final delivery*.
- **Order ledger**
  - Shows undelivered orders first, newest first.
  - Each order shows its customer, ID, item summary, total price (toman), colors, order date and time, delivery date, current station, a status badge, a link to the workshop view, and a delete button (click twice to confirm).
  - Prices are shown only in the Store and Products tabs.

### 1.2 Workshop — کارگاه تولید
- A capacity card per station with a progress bar: green under 60%, amber from 60%, red at 100% or more.
- A red banner appears when any station is at or over capacity.
- A kanban column per station. Each card shows the order, colors, notes, a **"<station> تمام شد"** (stage done) button, or **ثبت تحویل** (register delivery) in the final column.
- **Last-blocker highlight:** if an order is waiting on only one of finishing, painting or tailoring, that card is shown in purple with the label "فقط منتظر همینه".

### 1.3 Products — محصولات
- Add a model with a name, a category, and a price in toman.
- Delete a model (click twice to confirm). Existing orders keep the product name and price they were created with, as a snapshot.

### 1.4 History — تاریخچه
- Lists delivered orders.
- Search by customer name and filter by delivery date range (from / to).

---

## 2. Domain glossary

| Persian | Key | English | Default capacity |
|---|---|---|---|
| نجاری | `carpentry` | Carpentry (frame) | 6 |
| زیرکار | `zirkar` | Pre-finish / sanding & prep | 4 |
| رنگکار | `rangkar` | Painting / finishing | 4 |
| خیاط | `tailor` | Tailoring (fabric cutting & sewing) | 4 |
| رویه‌کوب | `ruyekoob` | Upholstery | 3 |
| تحویل نهایی | `final` | Final delivery (ready to hand over) | 8 |

Product categories: مبل (sofa), صندلی (chair), میز ناهارخوری (dining table), میز وسط (coffee table), سرویس خواب (bedroom set), گل میز (side table), آباژور (lamp), چوب لباسی (coat stand), قاب آیینه (mirror frame), اکسسوری (accessory).

---

## 3. Production flow (business rules)

```
                ┌──► زیرکار (zirkar) ──┐
نجاری ──────────┤                      │
(carpentry)     └──► رنگکار (rangkar) ─┤
                                       ├──► رویه‌کوب ──► تحویل نهایی ──► delivered
خیاط (tailor) ─────────────────────────┘    (ruyekoob)     (final)
   (runs in parallel from day one)
```

The rules below describe how the code decides which station column an order appears in.

- If carpentry is not done, the order is in **carpentry**.
- If carpentry is done, the order is in **zirkar** if zirkar isn't done, and in **rangkar** if rangkar isn't done. It can be in both at once.
- If tailor is not done, the order is in **tailor**, in parallel with the above.
- When carpentry, zirkar, rangkar and tailor are all done and ruyekoob is not, the order is in **ruyekoob**.
- When ruyekoob is done, the order is in **final**, until someone presses "register delivery".
- One order can therefore appear in up to three columns at the same time.

**Status badge (current logic):**
- Delivered: blue.
- Otherwise the badge counts days since the **order date** against a fixed 30-day target:
  - 0–10 days: green
  - 11–20 days: amber
  - 21–30 days: red
  - more than 30 days: red, showing "N days late"

---

## 4. Data model (as in the prototype)

```ts
type Product = {
  id: string;          // "P1", "P2", ...
  name: string;
  category: Category;  // one of the categories above
  price: number;       // toman
};

type OrderItem = {
  productId: string;
  productName: string; // snapshot at order time
  unitPrice: number;   // snapshot at order time
  qty: number;
  fabricColor: string;
  woodColor: string;
};

type Production = {
  carpentry: boolean;
  zirkar: boolean;
  rangkar: boolean;
  tailor: boolean;
  ruyekoob: boolean;
};

type Order = {
  id: string;               // "SF-1027", ...
  customer: string;
  items: OrderItem[];
  createdAt: string;        // order date, ISO yyyy-mm-dd
  requested: string;        // requested delivery date, ISO yyyy-mm-dd
  registeredAt: string|null;// full ISO timestamp of entry
  production: Production;
  delivered: boolean;
  deliveredAt: string|null; // ISO yyyy-mm-dd
  notes: string;
};
```

**Storage today:** two JSON blobs, `mizan:orders` and `mizan:products`, kept in Claude's artifact shared storage (`window.storage`). They are polled every 4 seconds to pick up changes from other people. There is no backend and no login.

**Legacy support:** `sanitizeOrders` and `sanitizeItems` convert old single-product orders into the newer multi-item format.

---

## 5. Known issues in the prototype

### Critical (must fix before real use)
- [ ] **Lost updates:** the whole orders array is overwritten on every save (last write wins). Two people editing at once silently lose changes.
- [ ] **Duplicate IDs:** `nextId()` is computed in the browser, so two users can create the same `SF-xxxx`.
- [ ] **No authentication:** anyone with the link can view prices, delete orders, or press **"Reset demo data"**, which wipes everything.
- [ ] **No undo:** "stage done", delivery and delete can't be reversed.
- [ ] **No order editing:** customer, items, dates and notes can't be changed after an order is created.

### Logic bugs
- [ ] Lateness is based on order date + 30 days and ignores the requested delivery date. An order past its promised date can still look green.
- [ ] Dates use `toISOString()`, which is UTC. In Iran (UTC+3:30), anything entered between 00:00 and 03:30 gets yesterday's date.
- [ ] History filters: an empty "from / to" filter still *displays* today's date in the Jalali picker, which is misleading.
- [ ] Success and error messages render twice: as a top banner and inline next to the buttons.
- [ ] "Up to 200 models" is mentioned in the UI but not enforced.
- [ ] The price input allows decimals (`step=0.01`), which doesn't fit toman.
- [ ] The last-blocker highlight only considers zirkar, rangkar and tailor, not carpentry.

### Hardcoded / missing
- [ ] Station capacities are hardcoded.
- [ ] Product categories are hardcoded.
- [ ] There is no customer list; the customer is free text on every order.
- [ ] There is no per-item production tracking; the whole order moves as one unit.
- [ ] There are no reports (revenue, throughput, on-time rate).

---

## 6. Roadmap (one part at a time)

### Phase 0 — Repo setup
- [ ] Import the prototype as `legacy/mizan-v43.jsx` and keep it untouched as a reference.
- [ ] Scaffold the app (Next.js + TypeScript + Tailwind) with RTL and the Vazirmatn font.
- [ ] Split the single file into modules: `lib/jalali.ts`, `lib/format.ts` (fa digits, price, dates), `lib/production.ts` (routing and status rules), and components per tab.
- [ ] Add unit tests for the Jalali conversion and production routing.

### Phase 1 — Fix the logic (still local, no backend)
- [ ] Base status on the **requested delivery date** (days left / days late), and optionally keep "day N of 30" as a secondary indicator.
- [ ] Use local-time date helpers instead of `toISOString()`.
- [ ] Fix the History filter's empty state, the duplicate toasts, and the price input.
- [ ] Add order editing and undo for stage changes.

### Phase 2 — Real backend
- [ ] Database (e.g. Supabase / Postgres) with tables `products`, `orders`, `order_items`, `stations`, `order_stage_events`.
- [ ] IDs generated on the server (sequence), and updates per record instead of per blob.
- [ ] Realtime updates in place of 4-second polling.
- [ ] Remove "Reset demo data" from production builds and keep it only in a seed script.

### Phase 3 — Users & roles
- [ ] Login.
- [ ] Roles: **store** (orders and prices), **workshop** (stations, no prices), **admin** (products, capacities, users).
- [ ] An audit log of who marked each stage done or deleted something, and when.

### Phase 4 — Nice to have
- [ ] Customer list with order history per customer.
- [ ] Configurable stations, capacities and categories.
- [ ] Per-item production tracking.
- [ ] Reports: on-time delivery rate, station throughput, revenue by period.
- [ ] Print / PDF order sheet for the workshop.
- [ ] Mobile-friendly workshop view, so station staff can tap "done" on a phone.

---

## 7. Suggested stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS + lucide-react
- **Backend / DB:** Supabase (Postgres, Auth, Realtime), or a similar service
- **Hosting:** Vercel
- **Testing:** Vitest for logic, Playwright for key flows

---

## 8. Design notes from the prototype

- **Palette:**
  - Walnut / cream: `#3B241A` header, `#EDE6D6` page background, `#F7F2E7` cards, `#9C7A3C` brass accent.
  - Status colors: green `#16A34A`, amber `#D97706`, red `#DC2626`, blue `#2563EB`.
  - Last-blocker purple: `#8B5CF6` border on `#F3E8FF`.
- **Font:** Vazirmatn.
- **Language:** all user-facing text is Persian, in an informal and friendly tone (e.g. "دوباره بزن"). All numbers are shown in Persian digits.
