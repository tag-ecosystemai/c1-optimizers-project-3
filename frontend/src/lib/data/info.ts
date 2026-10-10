import { api, getScope } from "./core";

export interface ProfileDoc { doc_code: string; title: string }
export interface DistributorInfo {
  id: number; name: string; segment: string; market: string; serves: string;
  supplied_by: { id: number; name: string }[];
  total_orders: number; open_incidents: number; profile_doc: ProfileDoc | null;
}
export interface WarehouseInfo {
  id: number; name: string; market: string; open_incidents: number;
  serves: { id: number; name: string; segment: string }[];
  sources: { note: string; transfer_donors: { id: number; name: string; market: string }[] };
  profile_doc: ProfileDoc | null;
}

export async function getDistributorInfo(id: number): Promise<DistributorInfo | null> {
  const scope = await getScope("ops");
  return api<DistributorInfo>(scope, `/api/ops/distributors/${id}`, { ignoreViewAs: true });
}
export async function getWarehouseInfo(id: number): Promise<WarehouseInfo | null> {
  const scope = await getScope("ops");
  return api<WarehouseInfo>(scope, `/api/ops/warehouses/${id}`, { ignoreViewAs: true });
}

export interface GuidanceItem { doc_code: string; title: string; section: string | null; snippet: string; similarity: number }

export async function getIncidentGuidance(id: number): Promise<GuidanceItem[]> {
  const scope = await getScope("ops");
  const r = await api<{ items: GuidanceItem[] }>(scope, `/api/ops/incidents/${id}/guidance`, { ignoreViewAs: true });
  return r?.items ?? [];
}