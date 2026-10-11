const BASE = "https://platform.arcade.ai/v1";

export async function arcade<T>(procedure: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${procedure}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ARCADE_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "clark/0.1 (arcade hackathon)",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Arcade ${procedure} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export type Category = { categoryId: string; name: string; world: "print" | "jewelry" };

let categories: Category[] | null = null;
export async function listCategories(): Promise<Category[]> {
  if (!categories) {
    const res = await arcade<{ items: Category[] }>("categories/list", {});
    categories = res.items.map(({ categoryId, name, world }) => ({ categoryId, name, world }));
  }
  return categories;
}

export type Job = {
  jobId: string;
  status: "running" | "succeeded" | "failed";
  result: { patternId?: string; productId?: string } | null;
  error: { message?: string } | null;
};

// One job designs the pattern and builds its product; jewelry categories accept a prompt only.
export async function startProduct(input: {
  requestId: string;
  prompt: string;
  categoryId: string;
  colors?: string[];
}): Promise<Job> {
  const category = (await listCategories()).find((c) => c.categoryId === input.categoryId);
  if (!category) throw new Error("Unknown Arcade category");
  const body: Record<string, unknown> = {
    requestId: input.requestId,
    prompt: input.prompt.slice(0, 1000),
    categoryId: input.categoryId,
  };
  if (category.world === "print" && input.colors?.length) body.colors = input.colors;
  return arcade<Job>("patterns/create", body);
}

export const getJob = (jobId: string) => arcade<Job>("jobs/get", { jobId });

export type ArcadeProduct = {
  productId: string;
  title: string;
  description: string | null;
  selectionLabel: string;
  images: { url: string }[];
  unitPrice: { amount: string; currency: string } | null;
  maker: { name: string };
};

export const getArcadeProduct = (productId: string) => arcade<ArcadeProduct>("products/get", { productId });

export const createCheckout = (requestId: string, productId: string, quantity: number) =>
  arcade<{ checkoutId: string; checkoutUrl: string }>("checkouts/create", {
    requestId,
    lines: [{ productId, quantity }],
    dropShip: true,
  });
