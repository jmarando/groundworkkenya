import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";

import { ConstituencyView } from "@/components/gw/elections/ConstituencyView";
import { CountyView } from "@/components/gw/elections/CountyView";
import { SetupPanel } from "@/components/gw/elections/SetupPanel";
import { WardView } from "@/components/gw/elections/WardView";
import { useAccess } from "@/hooks/useAccess";
import { RACES, YEARS, type Race } from "@/lib/atlas";
import { getAtlas } from "@/lib/atlas.functions";
import { RACE_NAMES } from "@/lib/atlas-view";
import {
  crumbsTo,
  defaultRace,
  homeAreaFor,
  nextElectionsSearch,
  SHADES,
  validateElectionsSearch,
  type ElectionsChanges,
  type Shade,
} from "@/lib/elections-view";

const ABOUT =
  "Three elections down to the constituency, who lives where, and where votes can move.";

export const Route = createFileRoute("/_authenticated/elections")({
  component: Elections,
  // ?area=nairobi/westlands&race=mp&year=2017&shade=swing: the place and race on show, so a link opens it.
  validateSearch: validateElectionsSearch,
  head: () => ({
    meta: [
      { title: "Elections · Groundwork" },
      { name: "description", content: ABOUT },
      { property: "og:title", content: "Elections · Groundwork" },
      { property: "og:description", content: ABOUT },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SHADE_NAMES: Record<Shade, string> = {
  todo: "What to do",
  lean: "Lean",
  turnout: "Turnout",
  swing: "Swing",
};

function Elections() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { campaign, isPrincipal } = useAccess();
  const fetchAtlas = useServerFn(getAtlas);
  const { data, isError, refetch } = useQuery({ queryKey: ["atlas"], queryFn: () => fetchAtlas() });
  const [setup, setSetup] = useState(false);

  const go = (changes: ElectionsChanges) =>
    void navigate({
      search: (prev) => nextElectionsSearch(prev, changes),
      // A new place is a step Back can undo, and starts at the top; a switch is neither.
      replace: !("area" in changes),
      resetScroll: "area" in changes,
    });

  if (isError)
    return (
      <section className="view active" aria-label="Elections">
        <div className="card">
          <h2>Couldn't load the election atlas.</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </section>
    );
  if (!data)
    return (
      <section className="view active" aria-label="Elections">
        <div className="vh">
          <div>
            <span className="eyebrow">Elections</span>
            <h1>Loading the atlas…</h1>
          </div>
        </div>
      </section>
    );

  const home = homeAreaFor(campaign, data.homeArea, data.areas);
  const key = search.area ?? home;
  const area = data.areas.find((a) => a.key === key);
  const race: Race = search.race ?? defaultRace(campaign?.level);
  const year = search.year ?? 2022;
  const shade: Shade = search.shade ?? "todo";

  if (!area) {
    const counties = data.areas.filter((a) => a.level === "county");
    return (
      <section className="view active" aria-label="Elections">
        <div className="card">
          <h2>Not loaded yet</h2>
          <p>
            The atlas doesn't hold “{key}” yet. It holds{" "}
            {counties.map((c, i) => (
              <Fragment key={c.key}>
                {i ? ", " : ""}
                <button type="button" className="vt-link" onClick={() => go({ area: c.key })}>
                  {c.name}
                </button>
              </Fragment>
            ))}{" "}
            and Kenya's national totals.
          </p>
        </div>
      </section>
    );
  }

  const crumbs = crumbsTo(data.areas, key);
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <section className="view active el" aria-label="Elections">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Elections · 2013, 2017 and 2022</span>
          <h1>{area.name}</h1>
          {crumbs.length > 1 ? (
            <nav className="crumbs" aria-label="Area">
              {crumbs.slice(0, -1).map((c) => (
                <Fragment key={c.key}>
                  <button type="button" onClick={() => go({ area: c.key })}>
                    {c.name}
                  </button>
                  <span className="sep">/</span>
                </Fragment>
              ))}
              <b aria-current="page">{area.name}</b>
            </nav>
          ) : null}
        </div>
        <div className="vh-side el-actions">
          {area.level === "constituency" ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()}>
              Print brief
            </button>
          ) : null}
          {isPrincipal ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSetup(true)}>
              Home area and sides
            </button>
          ) : null}
        </div>
      </div>
      <div className="el-switches">
        <div className="seg" role="group" aria-label="Race">
          {RACES.map((r) => (
            <button key={r} type="button" aria-pressed={race === r} onClick={() => go({ race: r })}>
              {RACE_NAMES[r]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Year">
          {YEARS.map((y) => (
            <button key={y} type="button" aria-pressed={year === y} onClick={() => go({ year: y })}>
              {y}
            </button>
          ))}
        </div>
        {area.level === "county" ? (
          <div className="seg" role="group" aria-label="Shade the map by">
            {SHADES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={shade === s}
                onClick={() => go({ shade: s })}
              >
                {SHADE_NAMES[s]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {area.level === "constituency" ? (
        <ConstituencyView
          d={data}
          area={area}
          race={race}
          year={year}
          canEdit={isPrincipal}
          onArea={(k) => go({ area: k })}
          onSetup={() => setSetup(true)}
        />
      ) : area.level === "ward" ? (
        <WardView d={data} area={area} race={race} year={year} canEdit={isPrincipal} />
      ) : (
        <CountyView
          d={data}
          area={area}
          race={race}
          year={year}
          shade={shade}
          canEdit={isPrincipal}
          onArea={(k) => go({ area: k })}
          onSetup={() => setSetup(true)}
        />
      )}
      <p className="el-print-only">
        Prepared with Groundwork on {today}. Every figure names its document; estimates are
        labelled.
      </p>
      {setup ? <SetupPanel d={data} home={home} onClose={() => setSetup(false)} /> : null}
    </section>
  );
}
