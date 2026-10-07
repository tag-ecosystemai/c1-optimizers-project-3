import type { AskSource, Role } from "@/types/api";

// Canned Ask conversations per role, the same four as the landing page (components/runout/AskDemo.tsx).
export interface MockConversation {
  question: string;
  tools: { name: string; label: string }[];
  answer: string;
  sources: AskSource[];
  starters: string[];
  /** Scope note shown under the input. */
  note: string;
}

export const conversations: Record<Role, MockConversation> = {
  ops: {
    question: "What needs a decision right now, and what should I approve?",
    tools: [
      { name: "rank_incidents", label: "Ranking open incidents by $ at risk" },
      { name: "read_investigations", label: "Reading the agent's investigations" },
    ],
    answer:
      "Four incidents are open with $2,221 at risk. Start with #812: order #55123 to Brazil Consumer, 240 units short and $1,181 at risk, most likely because of a port strike at Santos (72% confidence). I recommend upgrading it to First Class for $340, which covers 190 of the 240 units.",
    sources: [
      { type: "incident", label: "Incident #812", href: "/ops/incidents/812" },
      { type: "news", label: "GDELT: Santos port strike" },
    ],
    starters: ["Which incidents in LATAM are highest risk this week?", "Why is order 55123 delayed?", "Which warehouse has spare stock of cardio equipment?"],
    note: "Full access to every market.",
  },
  warehouse: {
    question: "Which of my SKUs are running thin, and which distributors are affected?",
    tools: [
      { name: "read_inventory", label: "Reading LATAM inventory" },
      { name: "match_incidents", label: "Matching open incidents to your distributors" },
    ],
    answer:
      "Two products are under two weeks of cover. Cardio equipment runs out on Mar 13 and hits Brazil Consumer, where order #55123 lands 5 days later, leaving 240 units short. Water sports has 9 days left and could hit Brazil Corporate if Friday's order slips. Everything else has more than 3 weeks.",
    sources: [
      { type: "inventory", label: "LATAM inventory", href: "/warehouse/inventory" },
      { type: "incident", label: "Incident #812", href: "/warehouse/incidents" },
    ],
    starters: ["Which of my SKUs are running thin?", "Which distributors are affected this week?", "What is incident #812 about?"],
    note: "I can only see your warehouse.",
  },
  distributor: {
    question: "Will my order arrive on time? Will I run out?",
    tools: [
      { name: "check_orders", label: "Checking your open orders" },
      { name: "read_stock", label: "Reading your stock" },
    ],
    answer:
      "Order #55123 is running about 7 days late and should now arrive on Mar 18. Your cardio equipment runs out on Mar 13, so you could be about 240 units short for five days. Your supplier has approved faster shipping, so this date may improve. I'll update you if it changes.",
    sources: [
      { type: "order", label: "Order #55123", href: "/my/orders/55123" },
      { type: "inventory", label: "Your stock", href: "/my/stock" },
    ],
    starters: ["Where is my order?", "Which of my products will run out first?"],
    note: "I can only see your account's data.",
  },
  data: {
    question: "Are the models, data and agent healthy?",
    tools: [
      { name: "check_models", label: "Checking model runs" },
      { name: "check_pipeline", label: "Checking pipeline freshness" },
      { name: "read_traces", label: "Reading agent traces" },
    ],
    answer:
      "All green. The delay model's champion is gradient boosting, off by 1.1 days on average. Last night's pipeline finished at 06:00 and all four stages passed. The agent ran 37 investigations today with no errors, averaging 4.2 seconds each.",
    sources: [
      { type: "model", label: "M1 champion v7", href: "/observability/models" },
      { type: "pipeline", label: "Pipeline run Mar 1", href: "/observability/pipeline" },
    ],
    starters: ["Are the models healthy?", "Did last night's pipeline pass?", "How is the agent performing?"],
    note: "Includes system internals.",
  },
};
