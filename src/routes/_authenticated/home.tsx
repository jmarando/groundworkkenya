import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Home } from "@/components/gw/home/Home";
import { useAccess } from "@/hooks/useAccess";
import { forCampaign, getScenario, scenarioForLevel } from "@/lib/demo";
import { getHome } from "@/lib/home.functions";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Home · Groundwork" },
      {
        name: "description",
        content:
          "Today's priorities, where the race stands, and whether the campaign's own work is on course.",
      },
      { property: "og:title", content: "Home · Groundwork" },
      {
        property: "og:description",
        content:
          "Today's priorities, where the race stands, and whether the campaign's own work is on course.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function HomePage() {
  // Each workspace shows its own race: the sample for it, named for its candidate.
  const { campaign } = useAccess();
  const fetchHome = useServerFn(getHome);
  const { data } = useQuery({
    queryKey: ["home", campaign?.id ?? null],
    queryFn: () => fetchHome(),
    enabled: Boolean(campaign?.id),
  });
  const s = forCampaign(getScenario(scenarioForLevel(campaign?.level)), campaign);
  return (
    <section className="view active" aria-label="Home">
      <Home s={s} {...(data ? { data } : {})} />
    </section>
  );
}
