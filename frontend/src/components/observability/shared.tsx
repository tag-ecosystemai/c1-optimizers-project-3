import { Tag, type TagTone } from "@/components/app/Tag";

const statusTone: Record<string, TagTone> = {
  ok: "good",
  connected: "good",
  champion: "good",
  active: "good",
  challenger: "info",
  running: "info",
  archived: "neutral",
  pending: "neutral",
  not_configured: "neutral",
  failed: "bad",
  error: "bad",
};

/** Tag for the API's status strings (`ok`, `not_configured`, `champion`…). */
export function StatusTag({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  return <Tag tone={statusTone[status] ?? "neutral"}>{label.charAt(0).toUpperCase() + label.slice(1)}</Tag>;
}
