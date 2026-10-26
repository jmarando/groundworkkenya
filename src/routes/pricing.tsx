import { createFileRoute, Link } from "@tanstack/react-router";

import { Cta, PageIntro, PublicPage, Qa, TierGrid } from "@/components/gw/landing/PublicPage";
import { faq } from "@/lib/faq";
import { priceOf, priceOffers } from "@/lib/pricing";
import { pageHead, SITE } from "@/lib/seo";

export const Route = createFileRoute("/pricing")({
  head: () =>
    pageHead({
      path: "/pricing",
      crumb: "Pricing",
      title: "Campaign software pricing: MCA, MP and county seats · Groundwork",
      description: `${priceOf("ward")} a month for an MCA campaign, ${priceOf("constituency")} for an MP and ${priceOf("county")} for a governor, senator or woman rep. Messaging, airtime and M-Pesa payouts at cost.`,
      nodes: [
        {
          "@type": "SoftwareApplication",
          name: "Groundwork",
          url: `${SITE}/`,
          applicationCategory: "BusinessApplication",
          offers: priceOffers(`${SITE}/pricing`),
        },
      ],
    }),
  component: Pricing,
});

function Pricing() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Pricing"
        title={
          <>
            Priced by the <span className="m">ground you cover.</span>
          </>
        }
        lead="One workspace per campaign, sized to the seat. Messaging, airtime and M-Pesa payouts are billed at cost, with nothing added on top."
      />

      <section>
        <div className="wrap">
          <TierGrid />
          <p className="note">
            Start early: the 18 months before polling day are when the roster, the map and the
            supporter list get built.
          </p>
        </div>
      </section>

      <section style={{ background: "var(--stone-2)" }}>
        <div className="wrap">
          <Qa
            items={[
              faq("What does it cost?"),
              faq("How long does it take to get started?"),
              faq("Do you work with every party?"),
            ]}
          />
          <Link className="more" to="/faq">
            More questions and answers →
          </Link>
        </div>
      </section>

      <Cta />
    </PublicPage>
  );
}
