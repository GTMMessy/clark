import { denied, hasAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { createTestOrder } from "@/lib/store-ops";

export const maxDuration = 60;

// Records a test order and creates the Arcade checkout the owner pays to fulfil it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccess())) return denied();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const product = (await db.getProducts(id)).find((p) => p.id === body.productId);
  if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
  try {
    return Response.json({ order: await createTestOrder(id, product) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
