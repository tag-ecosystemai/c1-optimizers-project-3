"use client";

import { useActionState } from "react";
import { uploadKnowledge, type UploadState } from "@/lib/data/knowledge";

const input = "w-full rounded-lg border border-line-subtle bg-white px-3 py-2 text-sm";

export function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadKnowledge, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-fg-2">
        Title
        <input name="title" required className={input} placeholder="e.g. Port strike playbook" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Type
          <select name="doc_type" defaultValue="reference" className={input}>
            {["policy", "procedure", "standard", "reference", "glossary", "regional_profile", "case"].map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Market
          <select name="market" defaultValue="all" className={input}>
            {["all", "USCA", "Europe", "LATAM", "Pacific Asia", "Africa"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Who can see it
          <select name="audience" defaultValue="ops,warehouse,distributor" className={input}>
            <option value="ops">Ops only</option>
            <option value="ops,warehouse">Ops and warehouses</option>
            <option value="ops,warehouse,distributor">Ops, warehouses and distributors</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-fg-2">
        File (.md or .txt)
        <input name="file" type="file" accept=".md,.txt" required className={input} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {pending ? "Uploading…" : "Upload"}
        </button>
        {state && (
          <p role="status" className={`text-sm ${state.ok ? "text-fg-2" : "text-risk-high"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}