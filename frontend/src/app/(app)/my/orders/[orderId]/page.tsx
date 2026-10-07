import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export async function generateMetadata({ params }: PageProps<"/my/orders/[orderId]">): Promise<Metadata> {
  return { title: `Order #${(await params).orderId}` };
}

export default async function Page({ params }: PageProps<"/my/orders/[orderId]">) {
  const { orderId } = await params;
  return (
    <>
      <PageHeader back={{ href: "/my/orders", label: "My orders" }} title={`Order #${orderId}`} />
      <EmptyState title="Order detail coming soon" description="The timeline, cover bar and briefing will appear here." />
    </>
  );
}
