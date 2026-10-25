# Mizan (میزان) — Furniture Sales & Production Coordinator

Mizan connects a furniture **store** (where orders are taken) with the **workshop** (where pieces are built), so both sides see the same orders, the same production status, and the same delivery dates.

The UI is Persian, right-to-left, and uses the Jalali (Persian) calendar.

> **Status:** Phases 0–4 of the roadmap are done. The original prototype is kept untouched in `legacy/mizan-v43.jsx` for reference.

---

## 1. Quick start (on your own computer)

Requires **Node 22 or newer**. No database to install: locally the app uses an embedded Postgres stored in `./.data/`.

```bash
npm install
npm run db:seed -- --with-demo-users   # optional: demo orders + users admin/store/workshop (password demo1234)
npm run dev                            # http://localhost:3000
```

Without the seed, the first visit asks you to create the admin account.

> Stop `npm run dev` before running `npm run db:seed`. The embedded database can only be opened by one process, and the seed script refuses to run while the app has it open.

Other commands:

```bash
npm test        # unit + API tests (Vitest, in-memory database)
npm run lint
npm run build && npm start   # production build
```

---

## 2. Putting it online for employees

Every employee needs their own login (Settings → Users). Choose one of the three options below.

### Option A — Railway (recommended)

Railway runs the app and its Postgres database in one project, and the app is a normal long-running server.

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** → pick this repo.
3. In the same project: **+ New → Database → PostgreSQL**.
4. Open the app service → **Variables** → add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway offers it as a reference variable).
5. **Settings → Networking → Generate Domain**. Optionally set the health check path to `/api/health`.
6. Open the domain, create the admin account, then add employees under **تنظیمات → کاربران**.

Railway detects Next.js and runs `npm run build` / `npm start` on its own. Tables are created automatically on first start. Turn on Railway's Postgres backups.

### Option B — Vercel + a hosted Postgres

1. Import the repo in Vercel.
2. Add a Postgres database from the Vercel Marketplace (Neon or Supabase) and connect it to the project, so `DATABASE_URL` is set. If the provider gives a *pooled* URL, use that one.
3. Optionally set `DATABASE_POOL_SIZE=1`, since each serverless instance opens its own connections.
4. Deploy, open the URL, and create the admin account.

Every pull request gets its own preview URL. Point previews at a separate database so test clicks don't touch real orders.

### Option C — A PC in the shop (no cloud)

On one always-on computer in the shop network:

```bash
npm install && npm run build
npm start -- -H 0.0.0.0 -p 3000
```

Employees open `http://<that-computer's-IP>:3000` on their phones or PCs, over the same Wi-Fi. Data lives in `./.data/` on that computer, so **back that folder up**. This option works only inside the shop network, unless you add a tunnel or VPN.

**Safety switch:** on Railway, Vercel, Render or Fly the app refuses to start without `DATABASE_URL`. Cloud disks are wiped on redeploy, and orders must not silently end up there.

---

## 3. Roles

| Role | Sees | Can do |
|---|---|---|
| **فروشگاه (store)** | Store, Workshop (read-only), Customers, History, Reports — with prices | Create / edit / delete orders, manage customers, mark delivery |
| **کارگاه (workshop)** | Workshop, History — **no prices, no customer list** (the server never sends them) | Mark stages done / undo, mark delivery, print workshop sheets |
| **مدیر (admin)** | Everything | All of the above, plus products, stations & capacities, categories, users, activity log |

Every change is recorded in the activity log (رویدادها) with who did it and when.

---

## 4. What the app does

- **Store** — new order form: customer (autocompletes from the customer list; new names are added automatically), order date, promised delivery date, items (model, quantity, fabric colour, wood colour), notes. "ثبت سفارش آماده" skips production for showroom stock. The list of open orders supports search, edit, print, "jump to workshop", and delete with undo.
- **Workshop** — capacity bar per station (green under 60%, amber from 60%, red at 100%+) and a red banner when a station is full. **Each item has its own card** and moves through the stations on its own. The whole order reaches *Final delivery* once every item is finished. Each card has a "done" button, a per-stage editor, and a printable sheet. Every stage change and delivery can be undone from the toast. On phones, one station is shown at a time.
- **Customers** — list with phone and notes, order count, total spent, and order history per customer.
- **History** — delivered orders, with search and a from/to date filter (empty means "any date"). Shows when a delivery was late and can return an order to the workshop.
- **Reports** — sales, on-time delivery rate, average delay and currently overdue orders for any date range, plus sales by Jalali month and work completed per station.
- **Products** (admin) — add / edit / remove models (up to 200 active). Prices are whole tomans. Existing orders keep the name and price they were sold at.
- **Settings** (admin) — station names and capacities, product categories, users and roles.
- **Activity log** (admin) — the last 300 actions: who, what and when.
- **Print sheet** — `/print/SF-xxxx`: an A4 workshop sheet without prices, with a tick box per stage per item and signature lines.

Changes made by one person appear for everyone within about 3 seconds.

---

## 5. Production flow (business rules)

```
                ┌──► زیرکار (zirkar) ──┐
نجاری ──────────┤                      │
(carpentry)     └──► رنگکار (rangkar) ─┤
                                       ├──► رویه‌کوب ──► تحویل نهایی ──► delivered
خیاط (tailor) ─────────────────────────┘    (ruyekoob)     (final)
   (runs in parallel from day one)
```

These rules apply **per item**. One rule set, in `src/lib/production.ts`, drives the board, the status text and the server-side checks.

- An item is in **carpentry** until carpentry is done. After that it's in **zirkar** and/or **rangkar** until each is done.
- It's in **tailor** until tailoring is done, in parallel with the above.
- When those four are done, it's in **ruyekoob**.
- When **every** item of an order has finished ruyekoob, the order is in **final** until someone registers delivery.
- The server rejects stages done out of order (zirkar before carpentry, for example). It also rejects undoing a stage that a later stage depends on.
- **Last blocker (purple):** the card is the only thing anyone can still work on before upholstery.

**Status badge** — measured against the **promised delivery date**:
- more than 3 days left: green "N روز مونده"
- 1–3 days left: amber
- due today: amber "امروز تحویل"
- past the promised date: red "N روز تأخیر"
- delivered: blue, noting how many days late if it was late

All "today" calculations use Tehran time (`NEXT_PUBLIC_APP_TIMEZONE`, default `Asia/Tehran`), whatever timezone the server is in.

---

## 6. Architecture

- **Next.js 16** (App Router) + TypeScript + Tailwind 4, Vazirmatn font, lucide-react icons.
- **API:** a single route handler, `src/app/api/[...path]/route.ts` → `src/server/api.ts`. A small router with a role check on every route. Every write runs in one transaction and is written to the activity log.
- **Database:** Postgres through the `pg` driver when `DATABASE_URL` is set, otherwise embedded PGlite (`src/server/db.ts`). Migrations live in `src/server/migrations.ts` and run automatically at startup.
- **Sync:** clients poll `/api/version` every 3 s and reload only when something changed. This works on any host, serverless included.
- **Auth:** username + password (scrypt), and an httpOnly session cookie that lasts 30 days. Deactivating a user or changing their password or role signs them out everywhere. Mutations require an `x-mizan` header, which blocks cross-site form posts.
- **Concurrency:** order codes come from a Postgres sequence. Stage changes lock the order row. Editing an order sends the version you started from, and the server rejects the save (409) if someone changed the order in the meantime.

Tables: `users`, `sessions`, `stations`, `categories`, `products`, `customers`, `orders`, `order_items` (production state per item), `order_events` (activity log), `app_meta` (change counter).

```
src/
  app/            page, print page, API route
  components/     one component per tab + shared UI
  lib/            shared logic (dates, Jalali, production rules, formatting, types)
  server/         API, auth, database, migrations, demo seed
scripts/seed.mts  npm run db:seed
legacy/           original prototype (reference only)
```

---

## 7. Domain glossary

| Persian | Key | English | Default capacity |
|---|---|---|---|
| نجاری | `carpentry` | Carpentry (frame) | 6 |
| زیرکار | `zirkar` | Pre-finish / sanding & prep | 4 |
| رنگکار | `rangkar` | Painting / finishing | 4 |
| خیاط | `tailor` | Tailoring (fabric cutting & sewing) | 4 |
| رویه‌کوب | `ruyekoob` | Upholstery | 3 |
| تحویل نهایی | `final` | Final delivery (ready to hand over) | 8 |

Station names and capacities, and the product categories, can be changed in Settings.

---

## 8. Prototype issues — all resolved

**Critical**
- [x] Lost updates (whole-list overwrite): each change now updates only its own records, inside a transaction.
- [x] Duplicate IDs: order codes come from a database sequence.
- [x] No authentication: logins and roles are in place, and "Reset demo data" is gone from the app (`npm run db:seed` replaces it).
- [x] No undo: stage changes, deliveries, deletes and product removals can be undone.
- [x] No order editing: orders can be edited, with protection against overwriting someone else's change.

**Logic bugs**
- [x] Lateness now uses the promised delivery date.
- [x] Dates use Tehran local time, not UTC.
- [x] An empty History filter shows "هر تاریخی" instead of today.
- [x] Messages appear once, in a single toast.
- [x] The 200-model limit is enforced on the server.
- [x] Prices are whole tomans; Persian digits and thousand separators are accepted.
- [x] The last-blocker highlight covers carpentry.
- [x] The status text and the board can't disagree: both come from the same rules, and the server rejects impossible states.
- [x] A slow save can no longer be overwritten by the next refresh, because the client only reloads from the server.
- [x] Same-day orders are sorted by the exact entry time.

**Hardcoded / missing**
- [x] Stations, capacities and categories can be edited.
- [x] Customer list.
- [x] Per-item production tracking.
- [x] Reports.

---

## 9. Roadmap

### Phase 0 — Repo setup ✅
- [x] Prototype kept in `legacy/`, app scaffolded (Next.js + TypeScript + Tailwind, RTL, Vazirmatn), logic split into modules, unit tests.

### Phase 1 — Fix the logic ✅
- [x] Status based on the promised date, Tehran-local dates, History filter, single toast, whole-toman prices, order editing, undo.

### Phase 2 — Real backend ✅
- [x] Postgres with `products`, `orders`, `order_items`, `stations`, `order_events` (plus users, sessions, customers, categories).
- [x] Server-generated IDs, per-record updates.
- [x] Live updates: polling a change counter every 3 s, so only changes are reloaded. This works on serverless hosts too; real push (SSE / WebSocket) is a possible later upgrade.
- [x] Demo data only through `npm run db:seed`.

### Phase 3 — Users & roles ✅
- [x] Login, roles store / workshop / admin, activity log.

### Phase 4 — Nice to have ✅
- [x] Customer list with order history.
- [x] Configurable station names and capacities, and categories. The order of the stages stays fixed, because the business rules depend on it.
- [x] Per-item production tracking.
- [x] Reports: on-time rate, station throughput, sales by month.
- [x] Printable workshop sheet.
- [x] Mobile-friendly workshop view.

### Possible next steps
- Push updates (SSE) instead of polling.
- Export reports to Excel.
- SMS to the customer when an order is ready.
- Photos and attachments per order.

---

## 10. Design notes

- **Palette:** walnut / cream — `#3B241A` header, `#EDE6D6` page background, `#F7F2E7` cards, `#9C7A3C` brass accent. Status colours: green `#16A34A`, amber `#D97706`, red `#DC2626`, blue `#2563EB`. Last blocker: purple `#8B5CF6` border on `#F3E8FF`.
- **Font:** Vazirmatn.
- **Language:** all user-facing text is Persian, in an informal and friendly tone (e.g. "دوباره بزن"). Numbers are shown in Persian digits.
