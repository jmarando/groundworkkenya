import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { useAccess } from "@/hooks/useAccess";
import { TODO_NAMES } from "@/lib/atlas";
import { lastHere, votersKey, type VotersPlace } from "@/lib/atlas-app";
import { getAtlas } from "@/lib/atlas.functions";
import { RACE_NAMES, TODO_COLOURS, whole } from "@/lib/atlas-view";
import { defaultRace, homeAreaFor } from "@/lib/elections-view";

/** One line under Voters' numbers: the campaign's race here last time, from the atlas. */
export function LastTimeHere({
  area,
  wards,
}: {
  area: VotersPlace;
  wards: { slug: string; constituency: string }[];
}) {
  const { campaign } = useAccess();
  const fetchAtlas = useServerFn(getAtlas);
  const { data: d } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    staleTime: 5 * 60_000,
  });
  if (!d) return null;
  const race = defaultRace(campaign?.level);
  const key = votersKey(d, area, wards, homeAreaFor(campaign, d.homeArea, d.areas));
  const l = key ? lastHere(d, key, race) : null;
  const at = l ? (d.areas.find((a) => a.key === l.at)?.name ?? "its constituency") : null;
  return (
    <p className="vt-last">
      <span className="vt-last-l">Last time here</span>
      {l ? (
        <>
          {RACE_NAMES[race]} {l.year}: {l.share}, turnout{" "}
          {l.f.turnout === null ? "not found" : whole(l.f.turnout)}
          {l.todo ? (
            <>
              {" "}
              <span className="el-chip" style={{ background: TODO_COLOURS[l.todo] }}>
                {TODO_NAMES[l.todo]}
              </span>
            </>
          ) : null}
          {l.constituencyFigure ? <span className="dim"> · the figure for {at}</span> : null}
        </>
      ) : (
        <span className="dim">not found yet in the atlas</span>
      )}
      {key ? (
        <>
          {" · "}
          <Link to="/elections" search={{ area: key }}>
            See it in Elections
          </Link>
        </>
      ) : null}
    </p>
  );
}
