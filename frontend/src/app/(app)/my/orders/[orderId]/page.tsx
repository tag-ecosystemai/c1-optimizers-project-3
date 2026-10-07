import { PANEL } from "@/components/app/Panel";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { CoverBar } from "@/components/app/CoverBar";
import { PageHeader } from "@/components/app/PageHeader";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { StatusPill } from "@/components/app/StatusPill";
import { Timeline } from "@/components/app/Timeline";
import { asOfDate, getMyOrder } from "@/lib/data";
import { date, days, num } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/my/orders/[orderId]">): Promise<Metadata> {
  return { title: `Order #${(await params).orderId}` };
}


function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export default async function Page({ params }: PageProps<"/my/orders/[orderId]">) {
  const { orderId } = await params;
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [o, asOf] = await Promise.all([getMyOrder(id), asOfDate()]);
  if (!o) notFound();
  const late = o.predicted_eta !== o.original_eta;

  return (
    <>
      <PageHeader
        back={{ href: "/my/orders", label: "My orders" }}
        eyebrow={
          <>
            <StatusPill status={o.status} />
            <SeverityBadge severity={o.risk} />
          </>
        }
        title={`Order #${o.order_id}`}
        description={`${o.product.name} · ${num(o.quantity)} units`}
      />

      {o.briefing_text && (
        <section aria-labelledby="briefing" className={`${PANEL} mb-4 ${late ? "border-red-200 bg-red-50/40" : ""}`}>
          <h2 id="briefing" className="mb-1 text-sm font-medium text-fg">
            What this means for you
          </h2>
          <p className="text-sm text-fg-2">{o.briefing_text}</p>
        </section>
      )}

      <dl className={`${PANEL} mb-4 grid grid-cols-2 gap-3 md:grid-cols-4`}>
        <Fact label="Ordered">{date(o.order_date)}</Fact>
        <Fact label="Shipping">{o.shipping_mode}</Fact>
        <Fact label="Original ETA">{date(o.original_eta)}</Fact>
        <Fact label="Predicted ETA">
          <span className={late ? "font-medium text-risk-high" : ""}>{date(o.predicted_eta)}</span>
          {o.predicted_delay_days > 0 && <span className="text-xs text-muted"> · {days(o.predicted_delay_days, { sign: true })}</span>}
        </Fact>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="timeline" className={PANEL}>
          <h2 id="timeline" className="mb-4 text-sm font-medium text-fg">
            Timeline
          </h2>
          <Timeline events={o.timeline} asOfDate={asOf} />
        </section>
        <section aria-labelledby="cover" className={PANEL}>
          <h2 id="cover" className="mb-4 text-sm font-medium text-fg">
            Your stock of this product
          </h2>
          {o.cover ? (
            <CoverBar asOfDate={asOf} cover={o.cover} />
          ) : (
            <p className="text-sm text-muted">No stockout is projected for this product.</p>
          )}
        </section>
      </div>
    </>
  );
}
