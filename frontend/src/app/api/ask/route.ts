import type { AskEvent, AskRequest } from "@/types/api";
import { getSession } from "@/lib/auth/session";
import { effectiveRole } from "@/lib/auth/routes";
import { conversations } from "@/mocks/ask";

// POST /api/ask as Server-Sent Events (spec §8.2). Mock mode replays the role's canned conversation.
// Scope comes from the session cookie, never the request body. Card C owns this file from here on.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ detail: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<AskRequest>;
  if (!body.query?.trim()) return Response.json({ detail: "query is required" }, { status: 422 });

  const convo = conversations[effectiveRole(session.role, session.viewAs)];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AskEvent) => controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      send({ event: "session", data: { session_id: body.session_id ?? crypto.randomUUID() } });
      for (const t of convo.tools) {
        if (req.signal.aborted) return controller.close();
        send({ event: "tool_call", data: { ...t, status: "started" } });
        await sleep(700);
        send({ event: "tool_call", data: { ...t, status: "done" } });
      }
      for (const word of convo.answer.split(" ")) {
        if (req.signal.aborted) return controller.close();
        send({ event: "token", data: { text: `${word} ` } });
        await sleep(40);
      }
      send({ event: "final", data: { message_id: crypto.randomUUID(), sources: convo.sources } });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
