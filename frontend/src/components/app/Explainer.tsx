import { BookOpen } from "lucide-react";

/** A collapsible "how to read this page" panel with a glossary. */
export function Explainer({ title = "How to read this page", terms }: { title?: string; terms: { term: string; meaning: string }[] }) {
  return (
    <details open className="mb-6 rounded-2xl border border-line-subtle bg-white shadow-soft">
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 font-display font-semibold text-fg">
        <BookOpen className="size-4 text-brand" /> {title}
      </summary>
      <dl className="grid gap-x-8 gap-y-3 border-t border-line-subtle px-5 py-4 text-sm md:grid-cols-2">
        {terms.map((t) => (
          <div key={t.term}>
            <dt className="font-medium text-fg">{t.term}</dt>
            <dd className="text-fg-2">{t.meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export const INVENTORY_TERMS = [
  { term: "Stock on hand", meaning: "Units physically in the warehouse on the as-of date." },
  { term: "As of", meaning: "The date of the stock count and of the model run behind these numbers." },
  { term: "Weekly usage", meaning: "How many units the distributors you serve are expected to use per week (from the M2 demand forecast)." },
  { term: "Days of cover", meaning: "How long the stock lasts: stock on hand ÷ (weekly usage ÷ 7). 0.6 days means it runs out in under a day." },
  { term: "High", meaning: "Stock is projected to run out before the next delivery lands, with $200 or more of margin at risk." },
  { term: "Medium", meaning: "The same situation, with $100 to $200 at risk." },
  { term: "Low", meaning: "The same situation, with under $100 at risk." },
  { term: "Covered", meaning: "Stock lasts until the next delivery arrives, so no shortage is expected." },
  { term: "How they connect", meaning: "Low days of cover plus a late delivery equals a shortage. Severity is how many dollars that shortage puts at risk." },
];

export const DISTRIBUTOR_STOCK_TERMS = [
  { term: "Recent weeks", meaning: "The small line shows how many units you ordered each of the last few weeks, so you can see your own ordering pattern." },
  { term: "Weekly usage (forecast)", meaning: "How many units the model expects you to use per week, based on your recent history." },
  { term: "Days of cover", meaning: "How long your stock lasts at that usage: stock ÷ (weekly usage ÷ 7). 2 days means you run out in two days." },
  { term: "Runs out", meaning: "The date your cover hits zero. The grey text says how many days from today that is." },
  { term: "Status", meaning: "Covered means your stock lasts until the next delivery. High, Medium or Low means a shortage is projected before the delivery lands, and the bigger the lost sales, the higher the level." },
  { term: "How they connect", meaning: "Short cover plus a late delivery equals a shortage. Products at the top of the table are the ones to worry about first." },
];

export const DISTRIBUTOR_OVERVIEW_TERMS = [
  { term: "Orders in transit", meaning: "Your orders that have shipped and haven't arrived yet." },
  { term: "Predicted late", meaning: "In-transit orders the delay model expects to arrive after their scheduled date." },
  { term: "Products at risk", meaning: "Products where a late delivery could leave you without stock." },
  { term: "Nearest stockout", meaning: "The earliest date any of your products is projected to run out." },
  { term: "Needs attention", meaning: "Open incidents that affect your orders. Click one to see what is being done about it." },
];