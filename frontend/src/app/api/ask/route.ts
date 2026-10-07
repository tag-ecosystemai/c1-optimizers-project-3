import type { AskEvent, AskRequest, AskSource, IncidentDetail, Role } from "@/types/api";
import { getSession, type Session } from "@/lib/auth/session";
import { effectiveRole } from "@/lib/auth/routes";
import { authMode, getIncident, getMyOrder, getMyStock, listIncidents, listMyOrders } from "@/lib/data";
import { date, days, percent, usd } from "@/lib/format";
import { conversations } from "@/mocks/ask";

// POST /api/ask as Server-Sent Events (spec §8.2): session → tool_call started/done… → token… → final, or error.
// Scope comes only from the session cookie (ops viewing as someone is that role); distributor_id / warehouse_id
// in the body are ignored. Mock mode answers from the lib/data functions, so their scoping applies.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };
const encoder = new TextEncoder();
const frame = (e: AskEvent) => encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);

interface Reply {
  tools: { name: string; label: string }[];
  answer: string;
  sources: AskSource[];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ detail: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<AskRequest>;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return Response.json({ detail: "query is required" }, { status: 422 });
  const sessionId = typeof body.session_id === "string" && body.session_id ? body.session_id : null;
  const incidentId = Number.isInteger(body.incident_id) ? (body.incident_id as number) : null;

  if (authMode() === "api") return proxy(req, session, { query, session_id: sessionId, incident_id: incidentId });

  const role = effectiveRole(session.role, session.viewAs);
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AskEvent) => {
        if (!closed) controller.enqueue(frame(e));
      };
      const finish = () => {
        if (!closed) controller.close();
        closed = true;
      };
      req.signal.addEventListener("abort", finish);

      send({ event: "session", data: { session_id: sessionId ?? crypto.randomUUID() } });
      try {
        const reply = await replyFor(role, query, incidentId);
        for (const t of reply.tools) {
          send({ event: "tool_call", data: { ...t, status: "started" } });
          await sleep(600 + Math.random() * 500);
          if (closed) return;
          if (/simulate error/i.test(query)) {
            send({ event: "error", data: { message: "The agent lost its connection to the data service. Try again." } });
            return finish();
          }
          send({ event: "tool_call", data: { ...t, status: "done" } });
        }
        await sleep(250);
        for (const word of reply.answer.split(" ")) {
          if (closed) return;
          send({ event: "token", data: { text: `${word} ` } });
          await sleep(/[.,:;]$/.test(word) ? 140 : 25 + Math.random() * 45);
        }
        send({ event: "final", data: { message_id: crypto.randomUUID(), sources: reply.sources } });
      } catch {
        send({ event: "error", data: { message: "Something went wrong while answering. Try again." } });
      }
      finish();
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/** Api mode: forward to FastAPI with the session's bearer token and pipe its event stream through untouched. */
async function proxy(req: Request, session: Session, body: AskRequest) {
  const url = new URL("/api/ask", process.env.API_URL);
  // Ops viewing as someone asks for that view, like lib/data/core.ts does.
  if (session.role === "ops" && session.viewAs) url.searchParams.set(`${session.viewAs.kind}_id`, String(session.viewAs.id));
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: req.signal,
      cache: "no-store",
    });
    if (upstream.status === 401) return Response.json({ detail: "Not signed in" }, { status: 401 });
    if (upstream.ok && upstream.body) return new Response(upstream.body, { headers: SSE_HEADERS });
  } catch {
    // fall through to the error event
  }
  return new Response(frame({ event: "error", data: { message: "The agent is unavailable right now. Try again in a moment." } }), { headers: SSE_HEADERS });
}

// ---- Mock answers -------------------------------------------------------------------------------------------

/** Picks the answer by context and keyword; falls back to the role's canned conversation. */
async function replyFor(role: Role, query: string, incidentId: number | null): Promise<Reply> {
  const q = query.toLowerCase();
  const fallback = conversations[role];
  if (role === "data") return fallback;

  const incidentRef = incidentId ?? num(q.match(/incident\s*#?\s*(\d+)/));
  if (incidentRef) return incidentReply(role, incidentRef);

  const orderRef = num(q.match(/order\s*#?\s*(\d{4,})/));
  if (role === "distributor") {
    if (orderRef || /order|arriv|late|deliver/.test(q)) return myOrderReply(orderRef);
    if (/run out|running out|stock|cover|first/.test(q)) return myStockReply();
    return fallback;
  }

  if (orderRef) {
    const hit = (await listIncidents({ q: String(orderRef) })).items.find((i) => i.order_id === orderRef);
    if (!hit) return notFound(`I can't find an open incident for order #${orderRef} in what you can see.`);
    return incidentReply(role, hit.incident_id);
  }
  if (role === "ops" && /spare|transfer|which warehouse/.test(q)) {
    return {
      tools: [
        { name: "read_network_inventory", label: "Checking inventory across warehouses" },
        { name: "rank_transfers", label: "Ranking transfer options" },
      ],
      answer:
        "The USCA warehouse has the most spare cardio equipment: about 3 weeks of cover above its own forecast, so it could release roughly 200 units without creating a new risk. Europe has a smaller surplus. A transfer to LATAM takes about 6 days, so it is slower than upgrading order #55123 to First Class.",
      sources: [
        { type: "inventory", label: "Network inventory", href: "/ops/network" },
        { type: "incident", label: "Incident #812", href: "/ops/incidents/812" },
      ],
    };
  }
  if (/risk|highest|urgent|decision|approve|affected|distributor|this week/.test(q)) return riskReply(role, q);
  return fallback;
}

const num = (m: RegExpMatchArray | null) => (m ? Number(m[1]) : null);
const notFound = (answer: string): Reply => ({ tools: [{ name: "search", label: "Searching your data" }], answer, sources: [] });
const incidentHref = (role: Role, id: number) => (role === "ops" ? `/ops/incidents/${id}` : role === "warehouse" ? "/warehouse/incidents" : "/my/orders");

async function incidentReply(role: Role, id: number): Promise<Reply> {
  const i = await getIncident(id);
  if (!i) return notFound(`I can't find incident #${id} in what you can see.`);
  return {
    tools: [
      { name: "read_incident", label: `Reading incident #${id}` },
      ...(i.probable_cause !== undefined ? [{ name: "read_investigation", label: "Reading the agent's investigation" }] : []),
    ],
    answer: describeIncident(i),
    sources: [
      { type: "incident", label: `Incident #${id}`, href: incidentHref(role, id) },
      ...(i.evidence ?? []).slice(0, 2).map<AskSource>((e) => ({ type: e.type === "news" ? "news" : "inventory", label: e.source })),
    ],
  };
}

/** Built only from the fields this role's incident payload carries, so a distributor never sees a dollar figure. */
function describeIncident(i: IncidentDetail): string {
  // Distributor payloads carry no distributor/cause/options: their own briefing says it best.
  if (!i.distributor && i.briefing_text) return i.briefing_text;
  const c = i.cascade;
  const parts = [
    `Incident #${i.incident_id} (${i.severity.toLowerCase()} severity, ${i.status}): order #${i.order.order_id} of ${i.product.name}${i.distributor ? ` to ${i.distributor.name}` : ""} is predicted ${days(c.predicted_delay_days)} late, arriving ${date(c.projected_arrival)} against a stockout on ${date(c.stockout_date)}, so about ${c.units_short} units short${c.money_at_risk_usd !== undefined ? ` with ${usd(c.money_at_risk_usd)} at risk` : ""}.`,
  ];
  if (i.probable_cause) parts.push(`Most likely cause: ${i.probable_cause}${i.cause_confidence ? ` (${percent(i.cause_confidence)} confidence)` : ""}.`);
  else if (i.probable_cause === null) parts.push("The agent is still investigating the cause.");
  const rec = i.recommended_options?.find((o) => o.recommended);
  if (rec) parts.push(`I recommend: ${rec.title}${rec.cost_usd !== undefined ? ` for ${usd(rec.cost_usd)}` : ""}, covering ${rec.units_covered} of the ${c.units_short} units.`);
  return parts.join(" ");
}

async function riskReply(role: Role, q: string): Promise<Reply> {
  const market = /latam/.test(q) ? "LATAM" : /europe/.test(q) ? "Europe" : /usca|us\b|canada/.test(q) ? "USCA" : /africa/.test(q) ? "Africa" : /asia|pacific/.test(q) ? "Pacific Asia" : undefined;
  const { items } = await listIncidents({ status: "open", market, limit: 3 });
  const where = market ? ` in ${market}` : "";
  if (!items.length) return notFound(`There are no open incidents${where} right now.`);
  const lines = items.map(
    (r, n) =>
      `${n + 1}. #${r.incident_id}: order #${r.order_id} to ${r.distributor.name}, ${r.product.name}, ${r.units_short} units short${r.money_at_risk_usd !== undefined ? ` and ${usd(r.money_at_risk_usd)} at risk` : ""}, stockout ${date(r.stockout_date)}.`,
  );
  return {
    tools: [
      { name: "rank_incidents", label: `Ranking open incidents${where} by risk` },
      { name: "read_investigations", label: "Reading the agent's investigations" },
    ],
    answer: `The highest-risk open incidents${where}: ${lines.join(" ")} Start with #${items[0].incident_id}.`,
    sources: items.map((r) => ({ type: "incident", label: `Incident #${r.incident_id}`, href: incidentHref(role, r.incident_id) })),
  };
}

async function myOrderReply(orderId: number | null): Promise<Reply> {
  const id = orderId ?? (await listMyOrders({ status: "in_transit" })).items.sort((a, b) => b.predicted_delay_days - a.predicted_delay_days)[0]?.order_id;
  const o = id ? await getMyOrder(id) : null;
  if (!o) return notFound(orderId ? `I can't find order #${orderId} on your account.` : "You have no orders in transit right now.");
  const answer =
    o.briefing_text ??
    `Order #${o.order_id} (${o.product.name}) is ${o.status.replace("_", " ")} and should arrive on ${date(o.predicted_eta)}${o.predicted_delay_days > 0 ? `, about ${days(o.predicted_delay_days)} later than planned` : ", on time"}.`;
  return {
    tools: [
      { name: "check_orders", label: "Checking your open orders" },
      { name: "predict_eta", label: "Reading the delivery forecast" },
    ],
    answer,
    sources: [{ type: "order", label: `Order #${o.order_id}`, href: `/my/orders/${o.order_id}` }],
  };
}

async function myStockReply(): Promise<Reply> {
  const rows = (await getMyStock()).filter((r) => r.stockout_date).sort((a, b) => a.stockout_date!.localeCompare(b.stockout_date!));
  const answer = rows.length
    ? `${rows[0].product.name} runs out first, on ${date(rows[0].stockout_date!)} (${days(rows[0].days_of_cover)} of cover).` +
      (rows.length > 1 ? ` Next: ${rows.slice(1, 3).map((r) => `${r.product.name} on ${date(r.stockout_date!)}`).join(", ")}.` : "") +
      " Everything else has enough stock for now."
    : "None of your products is projected to run out. You have enough stock for now.";
  return {
    tools: [
      { name: "read_stock", label: "Reading your stock" },
      { name: "forecast_usage", label: "Forecasting weekly usage" },
    ],
    answer,
    sources: [{ type: "inventory", label: "Your stock", href: "/my/stock" }],
  };
}
