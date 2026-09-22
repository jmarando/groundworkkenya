import { createFileRoute } from "@tanstack/react-router";

import { Placeholder } from "@/components/gw/Placeholder";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinancePage,
  head: () => ({
    meta: [
      { title: "Every shilling, accounted. · Groundwork" },
      { name: "description", content: "Contributions, expenditure and the statutory limit." },
      { property: "og:title", content: "Every shilling, accounted. · Groundwork" },
      { property: "og:description", content: "Contributions, expenditure and the statutory limit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function FinancePage() {
  return (
    <Placeholder
      eyebrow="Campaign finance · regulated period"
      title="Every shilling,"
      serif="accounted."
      meta="Contributions, expenditure and the statutory limit."
      note="The limit strip, ledger, approvals queue and audit export come next; contributions and expenses are already seeded."
    />
  );
}
