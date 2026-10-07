import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/session";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireRole("distributor");
  return children;
}
