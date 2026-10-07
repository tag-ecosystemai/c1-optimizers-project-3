import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { AskPanel } from "@/components/ask/AskPanel";

export const metadata: Metadata = { title: "Ask RunOut" };

export default function Page() {
  return (
    <>
      <PageHeader title="Ask RunOut" description="Ask about your orders and stock." />
      <AskPanel
        starters={["Where is my order?", "Which of my products will run out first?"]}
        note="I can only see your account's data."
        placeholder="Ask about orders or stock…"
      />
    </>
  );
}
