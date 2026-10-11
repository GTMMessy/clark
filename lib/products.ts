import { getArcadeProduct, getJob, startProduct } from "./arcade";
import { db, newId } from "./db";
import { publishProduct } from "./store-ops";
import type { Palette, Product } from "./types";

export const suggestedPrice = (cost: number) => Math.round(cost * 2);

export const paletteColors = (palette?: Palette) =>
  palette ? [palette.accent, palette.foreground, palette.background, palette.muted] : [];

// Starts one Arcade job for the product and saves it as "generating"; the store page polls until it lands.
export async function generateProduct(
  storeId: string,
  input: {
    id?: string;
    name: string;
    categoryId: string;
    categoryName: string;
    prompt: string;
    createdAt?: number;
    shopifyProductId?: string;
    replacesShopifyProductId?: string;
  },
  palette?: Palette,
): Promise<Product> {
  const product: Product = {
    id: input.id ?? newId(),
    name: input.name,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    prompt: input.prompt,
    status: "generating",
    images: [],
    createdAt: input.createdAt ?? Date.now(),
    // A redesign of a published product replaces its Shopify listing once the new version is ready.
    replacesShopifyProductId: input.shopifyProductId ?? input.replacesShopifyProductId,
  };
  try {
    const job = await startProduct({
      requestId: `clark-${storeId}-${product.id}-${newId()}`,
      prompt: input.prompt,
      categoryId: input.categoryId,
      colors: paletteColors(palette),
    });
    product.jobId = job.jobId;
  } catch (e) {
    product.status = "failed";
    product.error = e instanceof Error ? e.message : String(e);
  }
  await db.setProduct(storeId, product);
  return product;
}

// Checks running Arcade jobs (at most every 3 seconds each) and fills in photos and cost when they finish.
export async function advanceProducts(storeId: string): Promise<Product[]> {
  const products = await db.getProducts(storeId);
  await Promise.all(
    products.map(async (product) => {
      if (product.status !== "generating" || !product.jobId) return;
      if (product.checkedAt && Date.now() - product.checkedAt < 3000) return;
      try {
        const job = await getJob(product.jobId);
        product.checkedAt = Date.now();
        if (job.status === "failed" || (job.status === "succeeded" && !job.result?.productId)) {
          product.status = "failed";
          product.error = job.error?.message ?? "Arcade could not make this design.";
        } else if (job.status === "succeeded") {
          if (!(await db.claim(storeId, `ready:${product.jobId}`))) return;
          const made = await getArcadeProduct(job.result!.productId!);
          product.status = "ready";
          product.arcadeProductId = made.productId;
          product.title = made.title;
          product.description = made.description ?? "";
          product.images = made.images.map((image) => image.url);
          product.cost = made.unitPrice ? Number(made.unitPrice.amount) : undefined;
          if (product.cost && !product.price) product.price = suggestedPrice(product.cost);
          await db.addActivity(
            storeId,
            "Merchandiser",
            `${product.name} is ready${product.cost ? ` at $${product.cost.toFixed(2)} made and shipped` : ""}.`,
          );
        }
        await db.setProduct(storeId, product);
        // Products added after launch go straight onto the shelves.
        if (product.status === "ready") {
          const meta = await db.getMeta(storeId);
          if (meta?.phase === "live" && meta.shopify && (await publishProduct(storeId, meta.shopify, product, meta.proposal?.name ?? ""))) {
            await db.addActivity(storeId, "Merchandiser", `Published ${product.name} at $${product.price}.`);
          }
        }
      } catch {
        // A failed poll is retried on the next page refresh.
      }
    }),
  );
  return products;
}
