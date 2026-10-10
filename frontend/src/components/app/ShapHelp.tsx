import { Info } from "lucide-react";

/** Plain-language explanation shown above the SHAP chart. */
export function ShapHelp() {
  return (
    <div className="mb-4 rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm leading-6 text-fg-2">
      <p className="flex items-center gap-2 font-medium text-fg">
        <Info className="size-4 text-brand" /> How to read this chart
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          The M1 model predicts how many days late an order will arrive. This chart shows <strong>why</strong>, using a method called SHAP.
        </li>
        <li>
          Each bar is one fact about the order. <span className="font-medium text-risk-high">Red</span> bars push the delay up,{" "}
          <span className="font-medium text-risk-ok">green</span> bars pull it down. A longer bar means a bigger effect, in days.
        </li>
        <li>"Shipping mode adds 1.4 days" means this order's shipping class is usually slow, and that alone accounts for 1.4 days of the predicted delay.</li>
        <li>0.0 days means that fact barely affects this order.</li>
        <li>
          The <strong>delay risk score</strong> is the model's chance (0 to 100%) that the order arrives late.
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted">Shown for the most at-risk order in this incident. It explains the model; it does not cause the delay.</p>
    </div>
  );
}