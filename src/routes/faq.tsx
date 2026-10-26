import { createFileRoute } from "@tanstack/react-router";

import { Cta, PageIntro, PublicPage, Qa } from "@/components/gw/landing/PublicPage";
import { FAQ } from "@/lib/faq";
import { faqNode, pageHead } from "@/lib/seo";

export const Route = createFileRoute("/faq")({
  head: () =>
    pageHead({
      path: "/faq",
      crumb: "Questions",
      title: "Frequently asked questions · Groundwork",
      description:
        "Do supporters need smartphones? Can we use WhatsApp? Does it work in Kiswahili? Where do supporter records come from? Is the parallel tally official? What does it cost?",
      nodes: [faqNode(FAQ)],
    }),
  component: Questions,
});

function Questions() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Questions"
        title={
          <>
            Asked on every <span className="m">first call.</span>
          </>
        }
        lead="Smartphones, WhatsApp, Kiswahili, listening, where supporter records come from, whether the parallel tally is official, what it costs and how long it takes to start."
      />

      <section>
        <div className="wrap">
          <Qa items={FAQ} />
        </div>
      </section>

      <Cta />
    </PublicPage>
  );
}
