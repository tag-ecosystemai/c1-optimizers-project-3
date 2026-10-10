import type { ReactNode } from "react";

/** **bold** segments inside a line. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} className="font-medium text-fg">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      ),
    );
}

/** Renders the agent's briefing: one block per paragraph, bold labels, and the options as a list. */
export function Briefing({ text }: { text: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm leading-6 text-fg-2">
      {blocks.map((b, i) => {
        const opts = b.match(/^\*\*Options:\*\*\s*([\s\S]*)$/);
        if (opts) {
          const items = opts[1].replace(/\.$/, "").split(/;\s*(?=\(\d+\))/);
          return (
            <div key={i}>
              <strong className="font-medium text-fg">Options</strong>
              <ol className="mt-1 flex flex-col gap-1">
                {items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ol>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {inline(b)}
          </p>
        );
      })}
    </div>
  );
}