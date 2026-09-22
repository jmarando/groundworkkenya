import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/field")({
  component: FieldPage,
  head: () => ({
    meta: [
      { title: "The agent's phone. · Groundwork" },
      { name: "description", content: "Offline-first station reporting for ward agents." },
      { property: "og:title", content: "The agent's phone. · Groundwork" },
      { property: "og:description", content: "Offline-first station reporting for ward agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function FieldPage() {
  return (
    <Placeholder
      eyebrow="Election day · Field app"
      title="The agent's"
      serif="phone."
      meta="Offline-first station reporting for ward agents."
      note="The field phone surface and station report form come next."
    />
  );
}
