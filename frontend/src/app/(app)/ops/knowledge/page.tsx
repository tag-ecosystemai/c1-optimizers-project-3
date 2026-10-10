import type { Metadata } from "next";
import { ChevronDown, FileText } from "lucide-react";
import { listKnowledge } from "@/lib/data/knowledge";
import { date } from "@/lib/format";
import { load } from "@/lib/load";
import { KpiCard } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { PANEL } from "@/components/app/Panel";
import { UploadForm } from "@/components/ops/UploadForm";

export const metadata: Metadata = { title: "Knowledge" };

const TYPE_HELP: Record<string, string> = {
  policy: "Rules the company must follow. The agent cites these when it recommends an action.",
  procedure: "Step-by-step instructions for handling a situation, such as a delay or a stock transfer.",
  standard: "A required format or quality bar, for example how briefings and alerts must be written.",
  glossary: "Definitions of the terms and metrics used across RunOut.",
  reference: "Background guidance written for a specific audience.",
  regional_profile: "Logistics facts for one market: ports, carriers and seasonal risks.",
};

const col = "grid grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_1fr_24px] items-center gap-3";

export default async function Page() {
  const docs = await load(listKnowledge);
  const built = docs?.filter((d) => d.source !== "upload").length ?? 0;
  const uploaded = (docs?.length ?? 0) - built;

  return (
    <>
      <PageHeader title="Knowledge" description="The documents Ask and the agent can draw on. Upload a new one and it is available straight away." />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Documents" value={String(docs?.length ?? 0)} />
        <KpiCard accent="ok" label="Built-in" value={String(built)} />
        <KpiCard accent="medium" label="Uploaded by your team" value={String(uploaded)} />
      </div>

      <section className={`${PANEL} mb-6`}>
        <h2 className="mb-3 text-base text-fg">Upload a document</h2>
        <p className="mb-3 text-xs text-muted">Use "##" headings to split it into sections. Text and Markdown files for now.</p>
        <UploadForm />
      </section>

      <section className="overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-soft">
        <header className="border-b border-line-subtle bg-surface px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <FileText className="size-4 text-brand" /> Published documents
          </h2>
          <p className="mt-0.5 text-sm text-muted">Click a row to see what the document is for and who can use it.</p>
        </header>
        {!docs ? (
          <p className="p-5 text-sm text-muted">Couldn't load the documents.</p>
        ) : (
          <div className="text-sm">
            <div className={`${col} border-b border-line-subtle px-5 py-2 text-xs text-muted`}>
              <span>Document</span>
              <span>Type</span>
              <span>Market</span>
              <span>Source</span>
              <span>Updated</span>
              <span />
            </div>
            {docs.map((d) => (
              <details key={d.doc_id} className="group border-b border-line-faint last:border-0">
                <summary className={`${col} cursor-pointer px-5 py-3 hover:bg-surface`}>
                  <span className="min-w-0">
                    <span className="block truncate text-fg">{d.title}</span>
                    <span className="text-xs text-muted">{d.doc_code} · v{d.version}</span>
                  </span>
                  <span className="capitalize text-fg-2">{d.doc_type.replace("_", " ")}</span>
                  <span className="text-fg-2">{d.market}</span>
                  <span>
                    <span className={`rounded-md px-2 py-0.5 text-xs ${d.source === "upload" ? "bg-amber-50 text-amber-700" : "bg-surface text-muted"}`}>
                      {d.source === "upload" ? "Uploaded" : "Built-in"}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-fg-2">{date(d.updated_at.slice(0, 10))}</span>
                  <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-4 bg-surface px-5 py-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted">What this document is</p>
                    <p className="mt-1 text-fg-2">{TYPE_HELP[d.doc_type] ?? "A reference document used by the agent and Ask."}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Who can use it</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {d.audience.map((a) => (
                        <span key={a} className="rounded-md bg-white px-2 py-0.5 text-xs text-fg ring-1 ring-line-subtle">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted">How it is used</p>
                    <p className="mt-1 text-fg-2">
                      Split into sections. The agent and Ask search these sections and cite {d.doc_code} when they use it. Applies to: {d.market}.
                    </p>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}