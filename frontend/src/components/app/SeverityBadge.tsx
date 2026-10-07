import type { Severity } from "@/types/api";
import { RiskBadge } from "@/components/runout/RiskBadge";

/**
 * Severity pill (spec §4.1): text plus colour, never colour alone. NONE reads "Covered".
 * Screen readers hear "Severity: High".
 * @param severity LOW / MEDIUM / HIGH / NONE, as returned by the API.
 */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="inline-flex">
      <span className="sr-only">Severity: </span>
      <RiskBadge band={severity} />
    </span>
  );
}
