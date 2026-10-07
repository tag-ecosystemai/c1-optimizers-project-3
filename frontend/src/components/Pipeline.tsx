import { SectionFrame } from "./ui/SectionFrame";

// The five things RunOut does to every order, in order. Each links to its tab in IntelligentSystem.
export const STEPS = [
  { id: "predict-late-orders", label: "Predict late orders" },
  { id: "check-distributor-stock", label: "Check distributor stock" },
  { id: "find-the-cause", label: "Find the cause" },
  { id: "price-the-damage", label: "Price the damage" },
  { id: "approve-the-fix", label: "Approve the fix" },
];

/** Strip under the hero: the pipeline every order goes through. */
export function Pipeline() {
  return (
    <section aria-label="How RunOut handles every order" className="border-b border-subtle-stroke bg-secondary-background">
      <SectionFrame>
        <ol className="grid grid-cols-1 gap-px bg-subtle-stroke sm:grid-cols-5 lg:border-x lg:border-subtle-stroke">
          {STEPS.map(({ id, label }, i) => (
            <li key={id} className="bg-secondary-background">
              <a
                href={`#${id}`}
                className="group flex h-14 items-center gap-3 px-6 text-secondary-foreground transition-colors duration-300 hover:bg-white-300 hover:text-primary-foreground sm:h-24 sm:flex-col sm:items-start sm:justify-center sm:gap-1.5 lg:px-7"
              >
                <span className="font-mono text-xs text-tertiary-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-base font-medium tracking-tight lg:text-lg">{label}</span>
              </a>
            </li>
          ))}
        </ol>
      </SectionFrame>
    </section>
  );
}
