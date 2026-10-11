import { db } from "@/lib/db";
import { freshLinks } from "@/lib/shopify";

// The stable public link to a store. Shopify's own preview links expire, so each visit gets a fresh one;
// ?claim=1 goes to the page where the owner takes the store over on Shopify.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await db.getMeta(id);
  if (!meta?.shopify) return new Response("This store is not open yet.", { status: 404 });
  const links = await freshLinks(meta.shopify);
  const claim = new URL(req.url).searchParams.has("claim");
  const target = claim
    ? (links.claimUrl ?? meta.shopify.saveUrl ?? links.accessUrl ?? meta.shopify.previewUrl)
    : (links.accessUrl ?? meta.shopify.previewUrl);
  return Response.redirect(target, 302);
}
