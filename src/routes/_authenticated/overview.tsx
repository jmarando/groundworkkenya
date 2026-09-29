import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { EngineRoom } from "@/components/gw/overview/EngineRoom";
import { LiveOverview } from "@/components/gw/overview/LiveOverview";
import { useAccess } from "@/hooks/useAccess";
import { forCampaign, getScenario, scenarioForLevel, scenarioKey } from "@/lib/demo";
import type { ScenarioKey } from "@/lib/demo/types";

export const Route = createFileRoute("/_authenticated/overview")({
  validateSearch: (search: Record<string, unknown>): { c?: ScenarioKey; view?: "live" } => ({
    ...(typeof search["c"] === "string" ? { c: scenarioKey(search["c"]) } : {}),
    ...(search["view"] === "live" ? { view: "live" as const } : {}),
  }),
  component: Overview,
  head: () => ({
    meta: [
      { title: "Overview · Groundwork" },
      {
        name: "description",
        content:
          "Is the campaign on course? The verdict, the path to victory, the ground game by area, polling-day readiness and money.",
      },
      { property: "og:title", content: "Overview · Groundwork" },
      {
        property: "og:description",
        content:
          "Is the campaign on course? The verdict, the path to victory, the ground game by area, polling-day readiness and money.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Overview() {
  const { c, view } = Route.useSearch();
  // Each campaign's workspace opens on the demo for its own race.
  const { campaign } = useAccess();
  const navigate = useNavigate({ from: Route.fullPath });
  const live = view === "live";

  return (
    <>
      <nav className="mb-tabs" aria-label="Overview">
        <Link
          to="/overview"
          search={({ view: _live, ...rest }) => rest}
          aria-current={live ? undefined : "page"}
        >
          Command centre
        </Link>
        <Link
          to="/overview"
          search={(prev) => ({ ...prev, view: "live" as const })}
          aria-current={live ? "page" : undefined}
        >
          Live campaign data
        </Link>
      </nav>
      {live ? (
        <LiveOverview />
      ) : (
        <section className="view active" aria-label="Command centre">
          <EngineRoom
            s={forCampaign(getScenario(c ?? scenarioForLevel(campaign?.level)), campaign)}
            onPick={(key) => void navigate({ search: (prev) => ({ ...prev, c: key }) })}
          />
        </section>
      )}
    </>
  );
}
