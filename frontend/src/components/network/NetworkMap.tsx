import type { NetworkWarehouse } from "@/types/api";

// Static take on the landing page's HeroAgentMap: warehouses on the left, their distributors on the
// right, links red where a distributor has open incidents. Decorative summary; the cards carry the data.

const WX = 105;
const DX = 330;
const wy = (i: number) => 40 + i * 92;
const dy = (i: number, j: number) => wy(i) + (j - 1) * 26;
const curve = (y1: number, y2: number) => `M${WX} ${y1} C ${(WX + DX) / 2} ${y1}, ${(WX + DX) / 2} ${y2}, ${DX} ${y2}`;

const GREY = "#d5dae1";
const RED = "#dc2626";

export function NetworkMap({ network }: { network: NetworkWarehouse[] }) {
  const h = wy(network.length - 1) + 50;
  const hot = network.flatMap((n) => n.distributors).filter((d) => d.open_incidents > 0).length;
  return (
    <figure className="rounded-xl border border-line-subtle bg-white p-3">
      <svg viewBox={`0 0 480 ${h}`} className="h-auto w-full" role="img" aria-label={`Network map: ${network.length} warehouses, ${hot} distributors with open incidents`}>
        {network.map((n, i) =>
          n.distributors.map((d, j) => (
            <path key={d.id} d={curve(wy(i), dy(i, j))} fill="none" stroke={d.open_incidents ? RED : GREY} strokeWidth={d.open_incidents ? 2 : 1.25} strokeDasharray={d.open_incidents ? undefined : "4 4"} />
          )),
        )}
        {network.map((n, i) => (
          <g key={n.warehouse.id}>
            <rect x={WX - 9} y={wy(i) - 9} width={18} height={18} rx={5} fill="#fff" stroke={n.open_incidents ? RED : "#1c1d1f"} strokeWidth={1.5} />
            <text x={WX - 18} y={wy(i) + 4} textAnchor="end" fontSize={13} fontWeight={600} fill="#1c1d1f">
              {n.warehouse.market}
            </text>
            <text x={WX - 18} y={wy(i) + 19} textAnchor="end" fontSize={11} fill="#6d7988">
              {n.open_incidents ? `${n.open_incidents} open` : "all clear"}
            </text>
            {n.distributors.map((d, j) => (
              <g key={d.id}>
                <circle cx={DX} cy={dy(i, j)} r={d.open_incidents ? 5 : 4} fill={d.open_incidents ? RED : "#fff"} stroke={d.open_incidents ? RED : "#9aa3af"} strokeWidth={1.5} />
                <text x={DX + 12} y={dy(i, j) + 4} fontSize={12} fill={d.open_incidents ? RED : "#4b5563"}>
                  {d.name}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 px-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-risk-high" /> Open incidents
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-5 border-t border-dashed border-line-strong" /> No open incidents
        </span>
      </figcaption>
    </figure>
  );
}
