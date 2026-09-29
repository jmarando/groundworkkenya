import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { ElectionNight } from "@/components/gw/warroom/ElectionNight";
import { LiveWarRoom } from "@/components/gw/warroom/LiveWarRoom";
import { useAccess } from "@/hooks/useAccess";
import { forCampaign, getScenario, scenarioForLevel } from "@/lib/demo";

export const Route = createFileRoute("/_authenticated/warroom")({
  validateSearch: (search: Record<string, unknown>): { mode?: "live" } =>
    search["mode"] === "live" ? { mode: "live" } : {},
  component: WarRoom,
  head: () => ({
    meta: [
      { title: "War room · Groundwork" },
      {
        name: "description",
        content:
          "Parallel tally, projection, station coverage and incidents as election night runs.",
      },
      { property: "og:title", content: "War room · Groundwork" },
      {
        property: "og:description",
        content:
          "Parallel tally, projection, station coverage and incidents as election night runs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

/** The war room is a projector wall: the whole console goes dark while it's open. */
function useWarRoomSurface() {
  useEffect(() => {
    const main = document.querySelector(".main");
    main?.classList.add("is-warroom");
    return () => main?.classList.remove("is-warroom");
  }, []);
}

function WarRoom() {
  useWarRoomSurface();
  const { mode } = Route.useSearch();
  // Each campaign's workspace shows the demo for its own race, and only that.
  const { campaign } = useAccess();
  if (mode === "live") return <LiveWarRoom />;
  return (
    <ElectionNight s={forCampaign(getScenario(scenarioForLevel(campaign?.level)), campaign)} />
  );
}
