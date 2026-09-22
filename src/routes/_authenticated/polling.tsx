import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/polling")({
  component: PollingPage,
  head: () => ({
    meta: [
      { title: "Ask the ward, get an answer. · Groundwork" },
      { name: "description", content: "SMS, USSD and web polls with weighted results." },
      { property: "og:title", content: "Ask the ward, get an answer. · Groundwork" },
      { property: "og:description", content: "SMS, USSD and web polls with weighted results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PollingPage() {
  return (
    <Placeholder
      eyebrow="Polling"
      title="Ask the ward,"
      serif="get an answer."
      meta="SMS, USSD and web polls with weighted results."
      note="The poll builder, launch flow, live results and weighting come next; three polls and several hundred responses are already seeded."
    />
  );
}
