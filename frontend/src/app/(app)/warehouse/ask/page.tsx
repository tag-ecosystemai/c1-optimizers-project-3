import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { AskPanel } from "@/components/ask/AskPanel";

export const metadata: Metadata = { title: "Ask RunOut" };

export default function Page() {
  return (
    <>
      <PageHeader title="Ask RunOut" description="Ask about your warehouse's stock and incidents." />
      <AskPanel
        starters={["Which of my SKUs are running thin?", "Which distributors are affected this week?", "What is incident #812 about?"]}
        note="I can only see your warehouse's data."
        placeholder="Ask about your stock, distributors or incidents…"
      />
    </>
  );
}
