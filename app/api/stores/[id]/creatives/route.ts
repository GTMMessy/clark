import { denied, hasAccess } from "@/lib/access";
import { db } from "@/lib/db";

// Sets the total daily budget, shared equally between the ads that are not yet published.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccess())) return denied();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const total = Number(body.dailyBudget);
  const drafts = (await db.getAds(id)).filter((ad) => ad.status !== "paused");
  if (!Number.isFinite(total) || total <= 0 || !drafts.length) {
    return Response.json({ error: "Set a daily budget above zero." }, { status: 400 });
  }
  for (const ad of drafts) {
    ad.dailyBudget = Math.round((total / drafts.length) * 100) / 100;
    await db.setAd(id, ad);
  }
  return Response.json({ ok: true });
}
