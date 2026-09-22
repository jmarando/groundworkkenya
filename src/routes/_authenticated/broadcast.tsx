import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/broadcast")({
  component: BroadcastPage,
  head: () => ({
    meta: [
      { title: "Say it once, say it right. · Groundwork" },
      { name: "description", content: "Segmented sends with consent re-checked at send time." },
      { property: "og:title", content: "Say it once, say it right. · Groundwork" },
      { property: "og:description", content: "Segmented sends with consent re-checked at send time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function BroadcastPage() {
  return (
    <Placeholder
      eyebrow="Comms · Broadcast"
      title="Say it once,"
      serif="say it right."
      meta="Segmented sends with consent re-checked at send time."
      note="The audience builder, message composer, cost estimate and dry-run outbox come next."
    />
  );
}
