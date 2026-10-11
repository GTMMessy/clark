import fs from "fs";
import path from "path";
import type { Activity, Ad, Order, Product, StoreMeta } from "./types";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const usingDatabase = Boolean(url && serviceKey);

async function rest(query: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/kv${query}`, {
    ...init,
    headers: {
      apikey: serviceKey!,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Database ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

// Local fallback so the app runs without a database: one JSON file per key.
const dir = process.env.VERCEL ? "/tmp/clark-data" : path.join(process.cwd(), ".data");
const file = (key: string) => path.join(dir, encodeURIComponent(key) + ".json");

async function get<T>(key: string): Promise<T | null> {
  if (usingDatabase) {
    const rows = (await (await rest(`?key=eq.${encodeURIComponent(key)}&select=value`)).json()) as { value: T }[];
    return rows[0]?.value ?? null;
  }
  try {
    return JSON.parse(fs.readFileSync(file(key), "utf8")) as T;
  } catch {
    return null;
  }
}

async function set(key: string, value: unknown) {
  if (usingDatabase) {
    await rest("", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(key), JSON.stringify(value));
}

// Inserts a marker row and reports whether this caller was first; used so two page refreshes
// arriving together cannot both publish the same product.
async function claim(key: string): Promise<boolean> {
  if (usingDatabase) {
    const res = await fetch(`${url}/rest/v1/kv`, {
      method: "POST",
      headers: {
        apikey: serviceKey!,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ key, value: true }),
      cache: "no-store",
    });
    return res.ok;
  }
  if (fs.existsSync(file(key))) return false;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(key), "true");
  return true;
}

async function remove(key: string) {
  if (usingDatabase) await rest(`?key=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
  else fs.rmSync(file(key), { force: true });
}

// Collections are stored one row per item under a shared key prefix, so concurrent writers never overwrite each other.
async function listPrefix<T>(prefix: string): Promise<T[]> {
  if (usingDatabase) {
    const res = await rest(`?key=like.${encodeURIComponent(prefix)}*&select=value&order=key.asc`);
    return ((await res.json()) as { value: T }[]).map((row) => row.value);
  }
  if (!fs.existsSync(dir)) return [];
  const encoded = encodeURIComponent(prefix);
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(encoded))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T);
}

const k = (id: string, part: string) => `clark:${id}:${part}`;
const byTime = <T extends { createdAt?: number; ts?: number }>(a: T, b: T) =>
  (a.createdAt ?? a.ts ?? 0) - (b.createdAt ?? b.ts ?? 0);

export const db = {
  getMeta: (id: string) => get<StoreMeta>(k(id, "meta")),
  setMeta: (meta: StoreMeta) => set(k(meta.id, "meta"), meta),
  async listMetas(): Promise<StoreMeta[]> {
    if (!usingDatabase) return [];
    const res = await rest(`?key=like.${encodeURIComponent("clark:")}*${encodeURIComponent(":meta")}&select=value`);
    return ((await res.json()) as { value: StoreMeta }[]).map((row) => row.value);
  },
  async patchMeta(id: string, patch: (meta: StoreMeta) => void) {
    const meta = await get<StoreMeta>(k(id, "meta"));
    if (!meta) throw new Error("Store not found");
    patch(meta);
    await set(k(id, "meta"), meta);
    return meta;
  },
  async getProducts(id: string) {
    return (await listPrefix<Product>(k(id, "product:"))).sort(byTime);
  },
  setProduct: (id: string, product: Product) => set(k(id, "product:" + product.id), product),
  deleteProduct: (id: string, productId: string) => remove(k(id, "product:" + productId)),
  claim: (id: string, what: string) => claim(k(id, "lock:" + what)),
  async getActivity(id: string) {
    return (await listPrefix<Activity>(k(id, "activity:"))).sort(byTime);
  },
  addActivity: (id: string, role: string, text: string) => {
    const ts = Date.now();
    return set(k(id, `activity:${ts}-${newId()}`), { ts, role, text } satisfies Activity);
  },
  async getOrders(id: string) {
    return (await listPrefix<Order>(k(id, "order:"))).sort(byTime);
  },
  setOrder: (id: string, order: Order) => set(k(id, "order:" + order.id), order),
  async getAds(id: string) {
    return (await listPrefix<Ad>(k(id, "ad:"))).sort(byTime);
  },
  setAd: (id: string, ad: Ad) => set(k(id, "ad:" + ad.id), ad),
  getMessages: async <T>(id: string) => (await get<T[]>(k(id, "messages"))) ?? [],
  setMessages: (id: string, messages: unknown[]) => set(k(id, "messages"), messages),
  getBackup: (id: string, filename: string) => get<string>(k(id, "backup:" + filename)),
  setBackup: (id: string, filename: string, content: string) => set(k(id, "backup:" + filename), content),
};

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
