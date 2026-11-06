import type { Queryable } from "./db";

// Every change to a material's stock goes through here, so `materials.stock`
// always equals the sum of its movements.
export async function moveStock(
  q: Queryable,
  m: {
    materialId: number;
    delta: number;
    kind: "purchase" | "adjust" | "consume" | "release";
    userId: number;
    orderId?: number;
    itemId?: number;
    note?: string;
  }
): Promise<void> {
  await q.query("update materials set stock = stock + $2 where id = $1", [m.materialId, m.delta]);
  await q.query(
    "insert into stock_movements (material_id, delta, kind, order_id, item_id, note, user_id) values ($1, $2, $3, $4, $5, $6, $7)",
    [m.materialId, m.delta, m.kind, m.orderId ?? null, m.itemId ?? null, m.note ?? "", m.userId]
  );
}

// Brings what an item has taken from the warehouse in line with qty × the
// product's recipe. Passing qty 0 gives everything back. Returns the materials touched.
export async function syncItemStock(
  q: Queryable,
  item: { orderId: number; itemId: number; productId: number | null; qty: number; userId: number }
): Promise<number[]> {
  const recipe = item.productId
    ? await q.query<{ material_id: number; qty: number }>("select material_id, qty from product_materials where product_id = $1", [item.productId])
    : [];
  const taken = await q.query<{ material_id: number; taken: number }>(
    "select material_id, -sum(delta) as taken from stock_movements where item_id = $1 group by material_id",
    [item.itemId]
  );
  const want = new Map<number, number>();
  for (const r of recipe) want.set(r.material_id, r.qty * item.qty);
  const have = new Map(taken.map((t) => [t.material_id, t.taken]));
  const touched: number[] = [];
  for (const id of new Set([...want.keys(), ...have.keys()])) {
    // 3 decimals, like the column, so float noise can't leave tiny movements behind
    const diff = Math.round(((want.get(id) ?? 0) - (have.get(id) ?? 0)) * 1000) / 1000;
    if (diff === 0) continue;
    await moveStock(q, {
      materialId: id,
      delta: -diff,
      kind: diff > 0 ? "consume" : "release",
      orderId: item.orderId,
      itemId: item.itemId,
      userId: item.userId,
    });
    touched.push(id);
  }
  return touched;
}
