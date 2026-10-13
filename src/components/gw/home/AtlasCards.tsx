import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ResultList } from "@/components/gw/elections/ResultList";
import { useAccess } from "@/hooks/useAccess";
import { getAtlas } from "@/lib/atlas.functions";
import { raceInText, resultBlocks } from "@/lib/atlas-view";
import { defaultRace, homeAreaFor } from "@/lib/elections-view";

/** The atlas as Home reads it: the campaign's home area and race. Null until it loads. */
function useAtlasHome() {
  const { campaign } = useAccess();
  const fetchAtlas = useServerFn(getAtlas);
  const { data } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    staleTime: 5 * 60_000,
  });
  if (!data) return null;
  const home = homeAreaFor(campaign, data.homeArea, data.areas);
  return {
    d: data,
    home,
    homeName: data.areas.find((a) => a.key === home)?.name ?? "your area",
    race: defaultRace(campaign?.level),
  };
}

/** The campaign's race the last time, in its home area, from the atlas. */
export function LastResultCard() {
  const a = useAtlasHome();
  if (!a) return null;
  const block = resultBlocks(a.d, a.home, [a.race])[0] ?? null;
  return (
    <section className="card mb-last" aria-labelledby="home-last-h">
      <div className="card-head">
        <h2 id="home-last-h">Last time</h2>
        <Link to="/elections" search={{ area: a.home }} className="mono">
          Elections
        </Link>
      </div>
      {block ? (
        <ResultList block={block} />
      ) : (
        <p className="f-note">
          The last {raceInText(a.race)} result for {a.homeName} isn't in the atlas yet.{" "}
          <Link to="/elections" search={{ area: a.home }}>
            Open Elections
          </Link>
        </p>
      )}
    </section>
  );
}
