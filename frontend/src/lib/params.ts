// URL search-param helpers for list pages: read the first value and drop anything not allowed,
// so a hand-edited URL can't send junk to the data layer.
export type ParamValue = string | string[] | null | undefined;

/** First value of a search param, or undefined when absent or empty. */
export const first = (v: ParamValue) => (Array.isArray(v) ? v[0] : v) || undefined;

/** The value if it is one of `allowed`, else undefined. */
export const pick = <T extends string>(v: ParamValue, allowed: readonly T[]) => {
  const s = first(v);
  return allowed.includes(s as T) ? (s as T) : undefined;
};

/** A YYYY-MM-DD date, else undefined. */
export const isoDate = (v: ParamValue) => {
  const s = first(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
};

/** A positive integer id, else undefined. */
export const positiveInt = (v: ParamValue) => {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};
