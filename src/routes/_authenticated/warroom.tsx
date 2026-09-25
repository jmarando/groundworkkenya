import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ElectionNight } from "@/components/gw/warroom/ElectionNight";
import { LiveWarRoom } from "@/components/gw/warroom/LiveWarRoom";
import { getScenario, scenarioKey } from "@/lib/demo";
import type { ScenarioKey } from "@/lib/demo/types";

export const Route = createFileRoute("/_authenticated/warroom")({
  validateSearch: (search: Record<string, unknown>): { c?: ScenarioKey; mode?: "live" } => ({
    ...(typeof search["c"] === "string" ? { c: scenarioKey(search["c"]) } : {}),
    ...(search["mode"] === "live" ? { mode: "live" as const } : {}),
  }),
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
  const { c, mode } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  if (mode === "live") return <LiveWarRoom />;
  return (
    <ElectionNight
      s={getScenario(scenarioKey(c))}
      onPick={(key) => void navigate({ search: (prev) => ({ ...prev, c: key }) })}
    />
  );
}
