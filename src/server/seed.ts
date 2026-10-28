import { addDays, todayISO } from "@/lib/dates";
import { STAGES, type DelayReason, type Production, type Role, type StageKey } from "@/lib/types";
import { hashPassword } from "./auth";
import type { Db } from "./db";

const P = (s: string): Production => {
  const on = new Set(s.split(",").filter(Boolean));
  return Object.fromEntries(STAGES.map((k) => [k, on.has(k)])) as Production;
};
const FULL = P(STAGES.join(","));

const PRODUCTS: [string, string, number][] = [
  ["کاناپه سه‌نفره", "مبل", 45000000],
  ["مبل راحتی ال‌شکل", "مبل", 68000000],
  ["صندلی ناهارخوری (ست ۶ عددی)", "صندلی", 32000000],
  ["مبل کلاسیک هفت‌نفره", "مبل", 95000000],
  ["تخت‌خواب‌شو", "مبل", 52000000],
  ["میز جلومبلی", "میز وسط", 18000000],
  ["میز ناهارخوری", "میز ناهارخوری", 27000000],
];

type SeedItem = [product: number, qty: number, fabric: string, wood: string, production: Production];
type SeedOrder = {
  customer: string;
  ago: number;
  due: number;
  delivered?: number;
  items: SeedItem[];
  delay?: [StageKey, DelayReason, string];
};

// Dates are relative to today: `ago` days before, `due` days from today.
const ORDERS: SeedOrder[] = [
  { customer: "بوتیک مبلمان الوند", ago: 20, due: -3, delivered: 5, items: [[4, 1, "", "", FULL]] },
  {
    customer: "فروشگاه رویا", ago: 33, due: -2,
    items: [[3, 1, "مخمل سرمه‌ای", "گردو تیره", P("carpentry,rangkar")]],
    delay: ["tailor", "fabric", "مخمل سرمه‌ای از تأمین‌کننده نرسیده"],
  },
  { customer: "فروشگاه رویا", ago: 12, due: 6, items: [[0, 1, "", "", P("")]] },
  {
    customer: "دکوراسیون ماهور", ago: 9, due: 0,
    items: [[3, 1, "چرم مصنوعی مشکی", "راش روشن", FULL], [5, 1, "", "راش روشن", FULL]],
  },
  { customer: "بوتیک مبلمان الوند", ago: 15, due: 3, items: [[0, 2, "مخمل زرشکی", "", P("carpentry,zirkar,tailor")]] },
  { customer: "بوتیک مبلمان الوند", ago: 18, due: 5, items: [[1, 1, "", "", P("carpentry")]] },
  { customer: "دکوراسیون ماهور", ago: 5, due: 1, items: [[2, 1, "", "", P("")]] },
  {
    customer: "فروشگاه چوب و راحتی", ago: 2, due: 9,
    items: [[1, 1, "", "", P("tailor")], [6, 1, "", "گردو", P("carpentry,zirkar")]],
  },
  { customer: "دکوراسیون ماهور", ago: 22, due: 2, items: [[2, 1, "چرم قهوه‌ای", "راش تیره", P("carpentry,zirkar,rangkar,tailor")]] },
];

// Replaces all orders, products and customers with demo data. Users are kept.
export const DEMO_USERS: [username: string, name: string, role: Role][] = [
  ["admin", "مدیر", "admin"],
  ["store", "فروشگاه", "store"],
  ["workshop", "سرپرست کارگاه", "workshop"],
  ["carpentry", "رضا (نجاری)", "carpentry"],
  ["zirkar", "مهدی (زیرکار)", "zirkar"],
  ["rangkar", "حسین (رنگکار)", "rangkar"],
  ["tailor", "مریم (خیاط)", "tailor"],
  ["ruyekoob", "سعید (رویه‌کوب)", "ruyekoob"],
];

// Replaces all orders, products and customers with demo data. Users are kept.
export async function seedDemo(db: Db, { withDemoUsers = false } = {}): Promise<void> {
  const today = todayISO();
  const hash = withDemoUsers ? await hashPassword("demo1234") : "";
  await db.tx(async (q) => {
    await q.query("delete from order_events");
    await q.query("delete from order_items");
    await q.query("delete from orders");
    await q.query("delete from products");
    await q.query("delete from customers");

    if (withDemoUsers) {
      for (const [username, name, role] of DEMO_USERS) {
        await q.query(
          `insert into users (username, display_name, password_hash, role) values ($1, $2, $3, $4)
             on conflict (username) do nothing`,
          [username, name, hash, role]
        );
      }
    }
    // who "did" each finished stage in the demo: that station's worker, if there is one
    const workers = new Map(
      (await q.query<{ id: number; role: string }>("select id, role from users where active order by id")).map((u) => [u.role, u.id])
    );

    const productIds: number[] = [];
    const prices: number[] = [];
    for (const [name, category, price] of PRODUCTS) {
      const [row] = await q.query<{ id: number }>(
        "insert into products (name, category_id, price) select $1, id, $3 from categories where name = $2 returning id",
        [name, category, price]
      );
      productIds.push(row.id);
      prices.push(price);
    }

    await q.query("select setval('order_code_seq', 1027, false)");
    for (const o of ORDERS) {
      const [c] = await q.query<{ id: number }>(
        "insert into customers (name) values ($1) on conflict (name) do update set name = excluded.name returning id",
        [o.customer]
      );
      const orderDate = addDays(today, -o.ago);
      const [row] = await q.query<{ id: number }>(
        `insert into orders (code, customer_id, order_date, requested, registered_at, delivered_at)
         values ('SF-' || nextval('order_code_seq'), $1, $2, $3, ($2::date + time '10:30') at time zone 'Asia/Tehran', $4)
         returning id`,
        [c.id, orderDate, addDays(today, o.due), o.delivered === undefined ? null : addDays(today, -o.delivered)]
      );
      // history for the order timeline
      const event = (kind: string, at: string, userId: number | null, extra: { itemId?: number; stage?: StageKey; details?: object } = {}) =>
        q.query("insert into order_events (order_id, item_id, kind, stage, user_id, at, details) values ($1, $2, $3, $4, $5, $6, $7)", [
          row.id, extra.itemId ?? null, kind, extra.stage ?? null, userId, at, JSON.stringify(extra.details ?? {}),
        ]);
      await event("created", `${orderDate}T10:30:00+03:30`, workers.get("store") ?? workers.get("admin") ?? null);
      for (const [i, [p, qty, fabric, wood, prod]] of o.items.entries()) {
        // spread finished stages over the days since the order, in pipeline order
        const doneStages = STAGES.filter((s) => prod[s]);
        const step = Math.max(1, Math.floor(o.ago / (doneStages.length + 1)));
        const stageCols = STAGES.flatMap((s) => {
          const k = doneStages.indexOf(s);
          if (k < 0) return [false, null, null];
          const at = `${addDays(orderDate, Math.min(o.ago, (k + 1) * step))}T${String(9 + k).padStart(2, "0")}:15:00+03:30`;
          return [true, at, workers.get(s) ?? workers.get("workshop") ?? null];
        });
        const [item] = await q.query<{ id: number }>(
          `insert into order_items (order_id, position, product_id, product_name, unit_price, qty, fabric_color, wood_color,
                                    ${STAGES.map((s) => `${s}, ${s}_at, ${s}_by`).join(", ")})
           values (${Array.from({ length: 8 + STAGES.length * 3 }, (_, n) => `$${n + 1}`).join(", ")})
           returning id`,
          [row.id, i, productIds[p], PRODUCTS[p][0], prices[p], qty, fabric, wood, ...stageCols]
        );
        for (const [k, s] of STAGES.entries()) {
          if (stageCols[k * 3]) await event("stage_done", stageCols[k * 3 + 1] as string, stageCols[k * 3 + 2] as number | null, { itemId: item.id, stage: s });
        }
        if (o.delay) {
          const [stage, reason, note] = o.delay;
          const eta = addDays(today, 3);
          const at = `${addDays(today, -2)}T11:00:00+03:30`;
          await q.query(
            "insert into item_delays (item_id, stage, reason, note, eta, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7)",
            [item.id, stage, reason, note, eta, workers.get(stage) ?? null, at]
          );
          await event("delay_reported", at, workers.get(stage) ?? null, { itemId: item.id, stage, details: { reason, note, eta } });
        }
      }
      if (o.delivered !== undefined) {
        await event("delivered", `${addDays(today, -o.delivered)}T16:00:00+03:30`, workers.get("workshop") ?? null);
      }
    }
    await q.query("update app_meta set version = version + 1");
  });
}
