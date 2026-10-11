import { denied, hasAccess } from "@/lib/access";
import { db, newId } from "@/lib/db";
import type { StoreMeta } from "@/lib/types";

export async function POST(req: Request) {
  if (!(await hasAccess())) return denied();
  const body = await req.json().catch(() => ({}));
  const idea = String(body.idea ?? "").trim().slice(0, 600);
  if (!idea) return Response.json({ error: "Tell Clark what you want to sell." }, { status: 400 });
  const meta: StoreMeta = {
    id: newId(),
    createdAt: Date.now(),
    phase: "proposal",
    idea,
    nameHint: String(body.name ?? "").trim().slice(0, 80),
    inspiration: String(body.inspiration ?? "").trim().slice(0, 400),
    launch: {},
  };
  await db.setMeta(meta);
  return Response.json({ id: meta.id });
}
