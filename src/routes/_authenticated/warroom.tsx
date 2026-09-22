import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/warroom")({
  component: WarroomPage,
  head: () => ({
    meta: [
      { title: "Results as they land. · Groundwork" },
      { name: "description", content: "Station reporting, turnout and incident triage." },
      { property: "og:title", content: "Results as they land. · Groundwork" },
      { property: "og:description", content: "Station reporting, turnout and incident triage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function WarroomPage() {
  return (
    <Placeholder
      eyebrow="Election day · War room"
      title="Results as they"
      serif="land."
      meta="Station reporting, turnout and incident triage."
      note="The dark war-room surface, live tally and incident desk come next; 85 stations and sample incidents are seeded."
    />
  );
}
