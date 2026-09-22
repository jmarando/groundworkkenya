import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
  head: () => ({
    meta: [
      { title: "Every reply, in one queue. · Groundwork" },
      { name: "description", content: "Inbound SMS and USSD sessions, triaged and assigned." },
      { property: "og:title", content: "Every reply, in one queue. · Groundwork" },
      { property: "og:description", content: "Inbound SMS and USSD sessions, triaged and assigned." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function InboxPage() {
  return (
    <Placeholder
      eyebrow="Comms · Inbox"
      title="Every reply,"
      serif="in one queue."
      meta="Inbound SMS and USSD sessions, triaged and assigned."
      note="The conversation queue, assignment and reply composer come next, reading the seeded conversations."
    />
  );
}
