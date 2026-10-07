/**
 * The RunOut signature: stock burning down from today to the stockout date,
 * then a red gap until the order actually lands. No gap = it arrives in time.
 */
export function RunwayBar({
  coverDays,
  arrivalDays,
  windowDays = 30,
}: {
  coverDays: number;
  arrivalDays: number;
  windowDays?: number;
}) {
  const pct = (d: number) => `${(Math.min(Math.max(d, 0), windowDays) / windowDays) * 100}%`;
  const late = arrivalDays > coverDays;
  const gap = Math.max(arrivalDays - coverDays, 0);
  return (
    <div
      className="relative h-2 w-full rounded-full bg-line-faint"
      role="img"
      aria-label={late ? `Stock runs out in ${coverDays} days, the order lands ${gap} days later` : `The order lands ${coverDays - arrivalDays} days before stock runs out`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-fg/80 to-fg/25"
        style={{ width: pct(coverDays) }}
      />
      {late && (
        <div
          className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(-45deg,var(--color-risk-high)_0_3px,#fca5a5_3px_6px)]"
          style={{ left: pct(coverDays), width: `calc(${pct(arrivalDays)} - ${pct(coverDays)})` }}
        />
      )}
      <div
        className={`absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-page ${late ? "bg-risk-high" : "bg-risk-low"}`}
        style={{ left: pct(arrivalDays) }}
      />
    </div>
  );
}
