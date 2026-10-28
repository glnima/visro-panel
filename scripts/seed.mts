// Loads demo data. Uses DATABASE_URL if set, otherwise the local embedded database.
//   npm run db:seed                      orders, products, customers
//   npm run db:seed -- --with-demo-users also admin / store / workshop (password demo1234)
import "@/server/db-node";
import { getDb } from "@/server/db";
import { seedDemo } from "@/server/seed";

const withDemoUsers = process.argv.includes("--with-demo-users");

// The demo password is public (it's in this repo), so never create those
// accounts on a real database unless explicitly forced.
if (withDemoUsers && process.env.DATABASE_URL && !process.argv.includes("--force")) {
  console.error("Refusing to create demo users (password demo1234) on DATABASE_URL. Add --force if this really is a throwaway database.");
  process.exit(1);
}
const target = process.env.DATABASE_URL ? "DATABASE_URL" : "local embedded database (.data/pglite)";

const db = await getDb();
await seedDemo(db, { withDemoUsers });
await db.close();
console.log(`Demo data loaded into ${target}.${withDemoUsers ? " Demo users: admin, store, workshop, carpentry, zirkar, rangkar, tailor, ruyekoob — password demo1234" : ""}`);
