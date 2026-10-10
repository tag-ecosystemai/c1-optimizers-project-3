"use server";

import { revalidatePath } from "next/cache";
import { apiOrThrow, getScope } from "./core";

export interface KnowledgeDoc {
  doc_id: number; doc_code: string; title: string; doc_type: string; audience: string[];
  market: string; version: string; source: string; updated_at: string;
}

export async function listKnowledge(): Promise<KnowledgeDoc[]> {
  const scope = await getScope("ops", "data");
  const r = await apiOrThrow<{ items: KnowledgeDoc[] }>(scope, "/api/knowledge", { ignoreViewAs: true });
  return r.items;
}

export type UploadState = { ok: boolean; message: string } | null;

export async function uploadKnowledge(_prev: UploadState, form: FormData): Promise<UploadState> {
  const scope = await getScope("ops");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a .md or .txt file." };
  if (!String(form.get("title") ?? "").trim()) return { ok: false, message: "Add a title." };
  const res = await fetch(new URL("/api/knowledge/upload", process.env.API_URL), {
    method: "POST",
    headers: { Authorization: `Bearer ${scope.session.token}` },   // no Content-Type: fetch sets the multipart boundary
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.json().then((b: { detail?: string }) => b.detail, () => undefined);
    return { ok: false, message: detail ?? `Upload failed (${res.status})` };
  }
  const r = (await res.json()) as { title: string; chunks: number };
  revalidatePath("/ops/knowledge");
  return { ok: true, message: `Added "${r.title}" (${r.chunks} sections). Ask can use it now.` };
}