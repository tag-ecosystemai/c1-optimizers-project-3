import type { Metadata } from "next";
import { listKnowledge } from "@/lib/data/knowledge";
import { date } from "@/lib/format";
import { load } from "@/lib/load";
import { PageHeader } from "@/components/app/PageHeader";
import { PANEL } from "@/components/app/Panel";
import { UploadForm } from "@/components/ops/UploadForm";

export const metadata: Metadata = { title: "Knowledge" };

export default async function Page() {
  const docs = await load(listKnowledge);
  return (
    <>
      <PageHeader title="Knowledge" description="The documents Ask and the agent can draw on. Upload a new one and it is available straight away." />
      <section className={`${PANEL} mb-6`}>
        <h2 className="mb-3 text-base text-fg">Upload a document</h2>
        <p className="mb-3 text-xs text-muted">Use "##" headings to split it into sections. Text and Markdown files for now.</p>
        <UploadForm />
      </section>
      <section className={PANEL}>
        <h2 className="mb-3 text-base text-fg">Published documents</h2>
        {!docs ? (
          <p className="text-sm text-muted">Couldn't load the documents.</p>
        ) : (
          <ul className="divide-y divide-line-faint text-sm">
            {docs.map((d) => (
              <li key={d.doc_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-fg">
                  {d.title} <span className="text-xs text-muted">{d.doc_code} · v{d.version}</span>
                </span>
                <span className="text-xs text-muted">
                  {d.source === "upload" ? "Uploaded" : "Built-in"} · {d.doc_type.replace("_", " ")} · {d.market} · {date(d.updated_at.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}