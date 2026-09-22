import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/people")({
  component: PeoplePage,
  head: () => ({
    meta: [
      { title: "Every supporter, on one card. · Groundwork" },
      { name: "description", content: "Consented records, ward, segment, source and contact history." },
      { property: "og:title", content: "Every supporter, on one card. · Groundwork" },
      { property: "og:description", content: "Consented records, ward, segment, source and contact history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PeoplePage() {
  return (
    <Placeholder
      eyebrow="People · CRM"
      title="Every supporter,"
      serif="on one card."
      meta="Consented records, ward, segment, source and contact history."
      note="The people table, filters, segments and the person timeline land here next, reading the 1,200 seeded records already in the database."
    />
  );
}
