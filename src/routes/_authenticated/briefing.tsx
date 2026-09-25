import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { LiveBriefing } from "@/components/gw/briefing/LiveBriefing";
import { MorningBriefing } from "@/components/gw/briefing/MorningBriefing";
import { getScenario, scenarioKey } from "@/lib/demo";
import type { ScenarioKey } from "@/lib/demo/types";

export const Route = createFileRoute("/_authenticated/briefing")({
  validateSearch: (search: Record<string, unknown>): { c?: ScenarioKey; view?: "live" } => ({
    ...(typeof search["c"] === "string" ? { c: scenarioKey(search["c"]) } : {}),
    ...(search["view"] === "live" ? { view: "live" as const } : {}),
  }),
  component: Briefing,
  head: () => ({
    meta: [
      { title: "Briefing · Groundwork" },
      {
        name: "description",
        content:
          "The candidate's morning read: today's three decisions, the story that matters, the race, rivals, voters and polls.",
      },
      { property: "og:title", content: "Briefing · Groundwork" },
      {
        property: "og:description",
        content:
          "The candidate's morning read: today's three decisions, the story that matters, the race, rivals, voters and polls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Briefing() {
  const { c, view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const live = view === "live";

  return (
    <>
      <nav className="mb-tabs" aria-label="Briefing">
        <Link
          to="/briefing"
          search={({ view: _live, ...rest }) => rest}
          aria-current={live ? undefined : "page"}
        >
          Morning briefing
        </Link>
        <Link
          to="/briefing"
          search={(prev) => ({ ...prev, view: "live" as const })}
          aria-current={live ? "page" : undefined}
        >
          Live campaign data
        </Link>
      </nav>
      {live ? (
        <LiveBriefing />
      ) : (
        <section className="view active" aria-label="Morning briefing">
          <MorningBriefing
            s={getScenario(scenarioKey(c))}
            onPick={(key) => void navigate({ search: (prev) => ({ ...prev, c: key }) })}
          />
        </section>
      )}
    </>
  );
}
