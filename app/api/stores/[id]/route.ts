import { denied, hasAccess } from "@/lib/access";
import type Anthropic from "@anthropic-ai/sdk";
import { chatLines } from "@/lib/agent";
import { db } from "@/lib/db";
import { advanceProducts } from "@/lib/products";
import { canSell } from "@/lib/shopify";

export const maxDuration = 60;

// The store page polls this; each call also moves any running Arcade jobs forward.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccess())) return denied();
  const { id } = await params;
  const meta = await db.getMeta(id);
  if (!meta) return Response.json({ error: "Store not found" }, { status: 404 });
  const [products, activity, orders, ads, messages] = await Promise.all([
    advanceProducts(id),
    db.getActivity(id),
    db.getOrders(id),
    db.getAds(id),
    db.getMessages<Anthropic.MessageParam>(id),
  ]);
  const { shopify, metaAds, ...rest } = meta;
  return Response.json({
    meta: {
      ...rest,
      shopify: shopify && {
        domain: shopify.domain,
        previewUrl: `/s/${id}`,
        claimUrl: `/s/${id}?claim=1`,
        canSell: meta.phase === "live" ? await canSell(shopify) : false,
      },
    },
    products,
    activity,
    orders,
    ads,
    chat: chatLines(messages),
  });
}

// Renames the store before launch, or connects the owner's Meta ad account.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccess())) return denied();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const connection = body.metaAds && {
    accessToken: String(body.metaAds.accessToken ?? "").trim(),
    adAccountId: String(body.metaAds.adAccountId ?? "").trim(),
    pageId: String(body.metaAds.pageId ?? "").trim(),
  };
  if (connection && !(connection.accessToken && connection.adAccountId && connection.pageId)) {
    return Response.json({ error: "Meta needs a token, an ad account id and a Page id." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!connection && !name) return Response.json({ error: "A store needs a name." }, { status: 400 });
  try {
    await db.patchMeta(id, (meta) => {
      if (connection) meta.metaAds = connection;
      else if (meta.proposal) meta.proposal.name = name;
    });
  } catch {
    return Response.json({ error: "Store not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
