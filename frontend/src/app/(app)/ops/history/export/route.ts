import type { DecisionLogItem } from "@/types/api";
import { listDecisions } from "@/lib/data";
import { historyParams } from "../params";

// GET /ops/history/export: the decision log for the current filters as CSV. listDecisions scopes by
// the session (ops and data only), and the proxy already gates /ops/*.

const COLUMNS: [string, (d: DecisionLogItem) => string | number | null][] = [
  ["decided_at", (d) => d.decided_at],
  ["incident_id", (d) => d.incident_id],
  ["product", (d) => d.product?.name ?? null],
  ["market", (d) => d.market ?? null],
  ["action", (d) => d.action],
  ["option_chosen", (d) => d.option_title],
  ["decided_by", (d) => d.by],
  ["note", (d) => d.note],
  ["outcome", (d) => d.outcome],
];

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function GET(req: Request) {
  const params = { ...historyParams((k) => new URL(req.url).searchParams.get(k)), cursor: undefined };
  const rows: DecisionLogItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await listDecisions({ ...params, limit: 100, cursor });
    rows.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);

  const csv = [COLUMNS.map((c) => c[0]), ...rows.map((d) => COLUMNS.map(([, get]) => cell(get(d))))].map((r) => r.join(",")).join("\r\n");
  return new Response(csv + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="runout-decisions.csv"', "Cache-Control": "no-store" },
  });
}
