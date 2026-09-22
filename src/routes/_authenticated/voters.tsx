import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/voters")({
  component: VotersPage,
  head: () => ({
    meta: [
      { title: "The county, ward by ward. · Groundwork" },
      { name: "description", content: "Every ward with registered voters, targets and pace." },
      { property: "og:title", content: "The county, ward by ward. · Groundwork" },
      { property: "og:description", content: "Every ward with registered voters, targets and pace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function VotersPage() {
  return (
    <Placeholder
      eyebrow="Know your voters"
      title="The county,"
      serif="ward by ward."
      meta="Every ward with registered voters, targets and pace."
      note="The ward map, heat layers and win-number modelling come next, backed by the wards table."
    />
  );
}
