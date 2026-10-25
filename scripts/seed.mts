// Loads demo data. Uses DATABASE_URL if set, otherwise the local embedded database.
//   npm run db:seed                      orders, products, customers
//   npm run db:seed -- --with-demo-users also admin / store / workshop (password demo1234)
import { getDb } from "@/server/db";
import { seedDemo } from "@/server/seed";

const withDemoUsers = process.argv.includes("--with-demo-users");
const target = process.env.DATABASE_URL ? "DATABASE_URL" : "local embedded database (.data/pglite)";

const db = await getDb();
await seedDemo(db, { withDemoUsers });
await db.close();
console.log(`Demo data loaded into ${target}.${withDemoUsers ? " Demo users: admin / store / workshop, password demo1234" : ""}`);
