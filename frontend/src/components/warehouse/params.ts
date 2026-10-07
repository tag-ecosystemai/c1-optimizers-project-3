/** First value of a search param, or undefined when absent or empty. */
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export const SEVERITY_OPTIONS = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "NONE", label: "Covered" },
];
