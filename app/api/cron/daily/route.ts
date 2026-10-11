import { runAgent } from "@/lib/agent";
import { db } from "@/lib/db";
import { MORNING_REVIEW } from "@/lib/review";

export const maxDuration = 300;

// Vercel calls this once a day. Clark reviews the most recently opened live stores, one after another.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stores = (await db.listMetas())
    .filter((meta) => meta.phase === "live")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  const reviewed: string[] = [];
  for (const meta of stores) {
    try {
      await runAgent(meta.id, MORNING_REVIEW, () => {});
      await db.patchMeta(meta.id, (m) => {
        m.lastReviewAt = Date.now();
      });
      await db.addActivity(meta.id, "Clark", "Morning review done.");
      reviewed.push(meta.id);
    } catch {
      // One store failing must not stop the others.
    }
  }
  return Response.json({ reviewed });
}
