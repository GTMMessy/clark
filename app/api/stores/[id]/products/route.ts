import { denied, hasAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { generateProduct } from "@/lib/products";
import type { Proposal } from "@/lib/types";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// Makes the proposal's products, or remakes one of them with a new brief.
export async function POST(req: Request, { params }: Params) {
  if (!(await hasAccess())) return denied();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const meta = await db.getMeta(id);
  if (!meta) return Response.json({ error: "Store not found" }, { status: 404 });

  if (body.regenerate) {
    const product = (await db.getProducts(id)).find((p) => p.id === body.regenerate);
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    const prompt = String(body.prompt ?? product.prompt).trim() || product.prompt;
    await generateProduct(id, { ...product, prompt }, meta.proposal?.palette);
    await db.addActivity(id, "Designer", `Redesigning ${product.name}.`);
    return Response.json({ ok: true });
  }

  const proposal = (body.proposal ?? meta.proposal) as Proposal | undefined;
  if (!proposal?.products?.length) return Response.json({ error: "There is no proposal yet." }, { status: 400 });
  if ((await db.getProducts(id)).length) return Response.json({ ok: true });
  await db.patchMeta(id, (m) => {
    m.proposal = { ...m.proposal!, name: proposal.name, tagline: proposal.tagline, products: proposal.products };
    m.phase = "products";
  });
  await db.addActivity(id, "Designer", `Sent ${proposal.products.length} design briefs to Arcade's makers.`);
  await Promise.all(proposal.products.map((p) => generateProduct(id, p, proposal.palette)));
  return Response.json({ ok: true });
}

// Sets the owner's retail price for one product.
export async function PATCH(req: Request, { params }: Params) {
  if (!(await hasAccess())) return denied();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const product = (await db.getProducts(id)).find((p) => p.id === body.productId);
  const price = Number(body.price);
  if (!product || !Number.isFinite(price) || price <= 0) {
    return Response.json({ error: "Invalid price" }, { status: 400 });
  }
  product.price = Math.round(price * 100) / 100;
  await db.setProduct(id, product);
  return Response.json({ ok: true });
}
