import { cache } from "react";
import type { Me } from "@/types/api";
import { api, apiOrThrow, getScope } from "./core";

/** GET /api/me: the signed-in user's own profile (not the View as target). */
export async function getMe(): Promise<Me> {
  const scope = await getScope();
  return apiOrThrow<Me>(scope, "/api/me", { ignoreViewAs: true });
}

const FALLBACK_AS_OF = process.env.AS_OF_DATE ?? "2026-09-22";

const defaultDate = cache(async (): Promise<string | null> => {
  const scope = await getScope();
  const r = await api<{ default: string | null }>(scope, "/api/dates", { ignoreViewAs: true });
  return r?.default ?? null;
});

/** "Today" for every countdown (`YYYY-MM-DD`): the latest date the pipeline has processed. Never the browser clock. */
export async function asOfDate(): Promise<string> {
  return (await defaultDate()) ?? FALLBACK_AS_OF;
}