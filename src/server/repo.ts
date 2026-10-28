import {
  STAGES,
  canSeePrices as roleSeesPrices,
  type Bootstrap,
  type Category,
  type Customer,
  type Delay,
  type DelayReason,
  type Order,
  type OrderItem,
  type Product,
  type StageDone,
  type StageKey,
  type Station,
  type User,
} from "@/lib/types";
import type { Queryable } from "./db";

export const canSeePrices = (me: User) => roleSeesPrices(me.role);

type OrderRow = {
  id: number;
  code: string;
  customer_id: number;
  customer: string;
  order_date: string;
  requested: string;
  registered_at: string;
  delivered_at: string | null;
  notes: string;
  version: number;
};

type ItemRow = {
  id: number;
  order_id: number;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  qty: number;
  fabric_color: string;
  wood_color: string;
} & Record<StageKey, boolean> &
  Record<`${StageKey}_at`, string | null> &
  Record<`${StageKey}_by`, number | null>;

type DelayRow = {
  id: number;
  item_id: number;
  stage: StageKey;
  reason: DelayReason;
  note: string;
  eta: string | null;
  created_at: string;
  by_name: string | null;
};

const ORDER_SELECT = `
  select o.id, o.code, o.customer_id, c.name as customer, o.order_date, o.requested,
         o.registered_at, o.delivered_at, o.notes, o.version
    from orders o join customers c on c.id = o.customer_id`;

function toItem(r: ItemRow, prices: boolean, names: Map<number, string>, delays: Delay[]): OrderItem {
  const done: Partial<Record<StageKey, StageDone>> = {};
  for (const s of STAGES) {
    const at = r[`${s}_at`];
    const by = r[`${s}_by`];
    if (r[s] && at) done[s] = { at, by: by === null ? null : names.get(by) ?? null };
  }
  return {
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    unitPrice: prices ? r.unit_price : null,
    qty: r.qty,
    fabricColor: r.fabric_color,
    woodColor: r.wood_color,
    production: {
      carpentry: r.carpentry,
      zirkar: r.zirkar,
      rangkar: r.rangkar,
      tailor: r.tailor,
      ruyekoob: r.ruyekoob,
    },
    done,
    delays,
  };
}

async function attachItems(q: Queryable, rows: OrderRow[], prices: boolean): Promise<Order[]> {
  if (rows.length === 0) return [];
  const items = await q.query<ItemRow>(
    "select * from order_items where order_id = any($1::int[]) order by order_id, position, id",
    [rows.map((r) => r.id)]
  );
  const [users, delayRows] = await Promise.all([
    q.query<{ id: number; display_name: string }>("select id, display_name from users"),
    items.length
      ? q.query<DelayRow>(
          `select d.id, d.item_id, d.stage, d.reason, d.note, d.eta, d.created_at, u.display_name as by_name
             from item_delays d left join users u on u.id = d.created_by
            where d.resolved_at is null and d.item_id = any($1::int[])
            order by d.id`,
          [items.map((i) => i.id)]
        )
      : Promise.resolve([] as DelayRow[]),
  ]);
  const names = new Map(users.map((u) => [u.id, u.display_name]));
  const delaysByItem = new Map<number, Delay[]>();
  for (const d of delayRows) {
    const list = delaysByItem.get(d.item_id) ?? [];
    list.push({ id: d.id, stage: d.stage, reason: d.reason, note: d.note, eta: d.eta, at: d.created_at, by: d.by_name });
    delaysByItem.set(d.item_id, list);
  }
  const byOrder = new Map<number, OrderItem[]>();
  for (const it of items) {
    const list = byOrder.get(it.order_id) ?? [];
    list.push(toItem(it, prices, names, delaysByItem.get(it.id) ?? []));
    byOrder.set(it.order_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    customerId: r.customer_id,
    customer: r.customer,
    items: byOrder.get(r.id) ?? [],
    orderDate: r.order_date,
    requested: r.requested,
    registeredAt: r.registered_at,
    deliveredAt: r.delivered_at,
    notes: r.notes,
    version: r.version,
  }));
}

export async function loadOrders(q: Queryable, prices: boolean): Promise<Order[]> {
  const rows = await q.query<OrderRow>(`${ORDER_SELECT} where o.deleted_at is null order by o.id desc`);
  return attachItems(q, rows, prices);
}

export async function loadOrder(
  q: Queryable,
  where: { id: number } | { code: string },
  prices: boolean,
  { includeDeleted = false } = {}
): Promise<Order | null> {
  const [cond, val] = "id" in where ? ["o.id = $1", where.id] : ["o.code = $1", where.code];
  const rows = await q.query<OrderRow>(
    `${ORDER_SELECT} where ${cond}${includeDeleted ? "" : " and o.deleted_at is null"}`,
    [val]
  );
  return (await attachItems(q, rows, prices))[0] ?? null;
}

export async function loadStations(q: Queryable): Promise<Station[]> {
  return q.query<Station>("select key, label, capacity, sort from stations order by sort");
}

export async function loadCategories(q: Queryable): Promise<Category[]> {
  return q.query<Category>("select id, name, sort from categories order by sort, id");
}

export async function loadProducts(q: Queryable, prices: boolean): Promise<Product[]> {
  const rows = await q.query<{ id: number; name: string; category_id: number; price: number; active: boolean }>(
    "select id, name, category_id, price, active from products order by id"
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    price: prices ? r.price : null,
    active: r.active,
  }));
}

export async function loadCustomers(q: Queryable): Promise<Customer[]> {
  return q.query<Customer>("select id, name, phone, notes from customers order by name");
}

export async function getVersion(q: Queryable): Promise<number> {
  const rows = await q.query<{ version: number }>("select version from app_meta");
  return rows[0].version;
}

export async function bumpVersion(q: Queryable): Promise<void> {
  await q.query("update app_meta set version = version + 1");
}

export async function loadBootstrap(q: Queryable, me: User): Promise<Bootstrap> {
  const prices = canSeePrices(me);
  const [version, stations, categories, products, customers, orders] = await Promise.all([
    getVersion(q),
    loadStations(q),
    loadCategories(q),
    loadProducts(q, prices),
    prices ? loadCustomers(q) : Promise.resolve([]),
    loadOrders(q, prices),
  ]);
  return { me, version, stations, categories, products, customers, orders };
}

export async function logEvent(
  q: Queryable,
  e: {
    userId: number;
    kind: string;
    orderId?: number | null;
    itemId?: number | null;
    stage?: StageKey | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await q.query(
    "insert into order_events (order_id, item_id, kind, stage, user_id, details) values ($1, $2, $3, $4, $5, $6)",
    [e.orderId ?? null, e.itemId ?? null, e.kind, e.stage ?? null, e.userId, JSON.stringify(e.details ?? {})]
  );
}
