// The GitHub Pages demo has no server, so the real API (src/server/api.ts) runs
// right here in the browser against PGlite stored in IndexedDB. Each visitor
// gets their own private copy of the demo data.
import { handle } from "@/server/api";
import { PGLITE_PARSERS, getDb, setDbFactory, wrapPglite } from "@/server/db";
import { seedDemo } from "@/server/seed";

// Loaded from the CDN at runtime so the bundler never has to package the WASM build.
const PGLITE_URL = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.11/dist/index.js";
const DB_NAME = "idb://mizan-demo";
const TOKEN_KEY = "mizan-demo-token";

const importUrl = new Function("u", "return import(u)") as (u: string) => Promise<{
  PGlite: { create(dataDir: string, opts: object): Promise<Parameters<typeof wrapPglite>[0]> };
}>;

setDbFactory(async () => {
  const { PGlite } = await importUrl(PGLITE_URL);
  return wrapPglite(await PGlite.create(DB_NAME, { parsers: PGLITE_PARSERS }));
});

let ready: Promise<void> | null = null;

function ensureSeeded(): Promise<void> {
  ready ??= (async () => {
    const db = await getDb();
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from users");
    if (n === 0) await seedDemo(db, { withDemoUsers: true });
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: the session just won't survive a reload
  }
}

export async function demoFetch(method: string, path: string, body?: unknown): Promise<Response> {
  await ensureSeeded();
  const headers: Record<string, string> = { "x-mizan": "1" };
  const token = readToken();
  if (token) headers["x-mizan-session"] = token;
  const res = await handle(
    new Request("http://demo.local" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    { session: "header" }
  );
  if (path === "/api/logout") writeToken(null);
  const data = await res.clone().json().catch(() => null);
  if (data && typeof data.token === "string") writeToken(data.token);
  return res;
}

// Puts the demo orders, products and customers back to the starting state.
export async function resetDemo(): Promise<void> {
  await ensureSeeded();
  await seedDemo(await getDb(), { withDemoUsers: true });
}
