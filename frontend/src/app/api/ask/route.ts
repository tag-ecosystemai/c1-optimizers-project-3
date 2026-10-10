import type { AskRequest } from "@/types/api";
import { getSession, type Session } from "@/lib/auth/session";

// POST /api/ask as Server-Sent Events: session → tool_call… → token… → final, or error.
// Scope comes only from the session cookie; the API decides what the user (or ops viewing as someone) may see.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };
const encoder = new TextEncoder();
const errorFrame = (message: string) => encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ detail: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<AskRequest>;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return Response.json({ detail: "query is required" }, { status: 422 });
  const sessionId = typeof body.session_id === "string" && body.session_id ? body.session_id : null;
  const incidentId = Number.isInteger(body.incident_id) ? (body.incident_id as number) : null;
  return proxy(req, session, { query, session_id: sessionId, incident_id: incidentId });
}

async function proxy(req: Request, session: Session, body: AskRequest) {
  const url = new URL("/api/ask", process.env.API_URL);
  const v = session.role === "ops" ? session.viewAs : null;
  if (v) url.searchParams.set(`${v.kind}_id`, String(v.id));
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(v && { "X-View-As": v.kind }),
      },
      body: JSON.stringify(body),
      signal: req.signal,
      cache: "no-store",
    });
    if (upstream.status === 401) return Response.json({ detail: "Not signed in" }, { status: 401 });
    if (upstream.ok && upstream.body) return new Response(upstream.body, { headers: SSE_HEADERS });
  } catch {
    // fall through to the error event
  }
  return new Response(errorFrame("The agent is unavailable right now. Try again in a moment."), { headers: SSE_HEADERS });
}