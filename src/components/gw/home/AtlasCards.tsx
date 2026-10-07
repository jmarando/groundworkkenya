import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ResultList } from "@/components/gw/elections/ResultList";
import { useAccess } from "@/hooks/useAccess";
import { TODO_NAMES } from "@/lib/atlas";
import { topMoves } from "@/lib/atlas-app";
import { getAtlas } from "@/lib/atlas.functions";
import {
  electionOf,
  RACE_NAMES,
  raceInText,
  resultBlocks,
  TODO_COLOURS,
  votes,
} from "@/lib/atlas-view";
import { defaultRace, homeAreaFor } from "@/lib/elections-view";

/** The atlas as Home reads it: the campaign's home area and race. Null until it loads. */
function useAtlasHome() {
  const { campaign, isPrincipal } = useAccess();
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
    canSet: isPrincipal,
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

/** The home area's parts with the most votes within reach, each with what to do and why. */
export function MovesCard() {
  const a = useAtlasHome();
  if (!a) return null;
  const side = a.d.sides[electionOf(a.race, 2022)];
  const moves = topMoves(a.d, a.home, a.race);
  return (
    <section className="card" aria-labelledby="home-moves-h">
      <div className="card-head">
        <h2 id="home-moves-h">Where votes can move</h2>
        <span className="mono">{RACE_NAMES[a.race]} · 2022</span>
      </div>
      {!side ? (
        <p className="f-note">
          {a.canSet ? (
            <>
              Set your side in 2022 in{" "}
              <Link to="/elections" search={{ area: a.home }}>
                Elections
              </Link>{" "}
              to see where votes can move.
            </>
          ) : (
            "Once the candidate or campaign manager sets your side in 2022 in Elections, the places where votes can move show here."
          )}
        </p>
      ) : moves.length ? (
        <ol className="home-moves">
          {moves.map((f) => (
            <li key={f.key}>
              <div className="home-moves-h">
                <Link to="/elections" search={{ area: f.key }}>
                  {f.name}
                </Link>
                {f.todo ? (
                  <span className="el-chip" style={{ background: TODO_COLOURS[f.todo.todo] }}>
                    {TODO_NAMES[f.todo.todo]}
                  </span>
                ) : null}
                <b>{f.reach ? votes(f.reach.total) : "—"}</b>
              </div>
              <p className="meta">
                {f.todo?.reason} {f.reach ? "Votes within reach." : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="f-note">
          Not found yet: {a.homeName}'s parts have no {raceInText(a.race)} results in the atlas.
        </p>
      )}
      <p className="meta">
        <Link to="/elections" search={{ area: a.home }}>
          All of it in Elections
        </Link>
      </p>
    </section>
  );
}
