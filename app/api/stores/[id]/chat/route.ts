import { denied, hasAccess } from "@/lib/access";
import { runAgent, type AgentEvent } from "@/lib/agent";
import { db } from "@/lib/db";
import { MORNING_REVIEW } from "@/lib/review";

export const maxDuration = 300;

// Streams the agent's turn as newline-delimited JSON events.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAccess())) return denied();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const meta = await db.getMeta(id);
  if (!meta) return Response.json({ error: "Store not found" }, { status: 404 });

  let text = String(body.text ?? "").trim().slice(0, 4000);
  if (body.kickoff) {
    if (meta.kickedOff) return Response.json({ skipped: true });
    await db.patchMeta(id, (m) => {
      m.kickedOff = true;
    });
    text = [
      "I want to open a store.",
      `What I want to sell: ${meta.idea}`,
      meta.nameHint && `Name: ${meta.nameHint}`,
      meta.inspiration && `How it should look: ${meta.inspiration}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  // The owner can start the daily review by hand instead of waiting for the morning run.
  if (body.review) {
    text = MORNING_REVIEW;
    await db.patchMeta(id, (m) => {
      m.lastReviewAt = Date.now();
    });
  }
  if (!text) return Response.json({ error: "Say something to Clark." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await runAgent(id, text, emit);
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
        emit({ type: "done" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
