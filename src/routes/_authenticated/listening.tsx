import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/listening")({
  component: ListeningPage,
  head: () => ({
    meta: [
      { title: "What the county is saying. · Groundwork" },
      { name: "description", content: "Themes, sentiment and volume across inbound channels." },
      { property: "og:title", content: "What the county is saying. · Groundwork" },
      { property: "og:description", content: "Themes, sentiment and volume across inbound channels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function ListeningPage() {
  return (
    <Placeholder
      eyebrow="Comms · Listening"
      title="What the county"
      serif="is saying."
      meta="Themes, sentiment and volume across inbound channels."
      note="Theme extraction and trend charts come next, built on inbound messages."
    />
  );
}
