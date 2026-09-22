import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/foundations")({
  component: FoundationsPage,
  head: () => ({
    meta: [
      { title: "The house style. · Groundwork" },
      { name: "description", content: "Colours, type, logo usage and component patterns." },
      { property: "og:title", content: "The house style. · Groundwork" },
      { property: "og:description", content: "Colours, type, logo usage and component patterns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function FoundationsPage() {
  return (
    <Placeholder
      eyebrow="System · Brand & design"
      title="The house"
      serif="style."
      meta="Colours, type, logo usage and component patterns."
      note="The brand foundations page comes next, using the logo kit already in the project."
    />
  );
}
