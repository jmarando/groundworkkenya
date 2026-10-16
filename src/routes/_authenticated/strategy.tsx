import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";

import { FindingItem } from "@/components/gw/findings/FindingItem";
import { PathToStateHouse } from "@/components/gw/strategy/PathToStateHouse";
import { useAccess } from "@/hooks/useAccess";
import { useFindings } from "@/hooks/useFindings";
import { getAtlas } from "@/lib/atlas.functions";
import { homeAreaFor } from "@/lib/elections-view";
import {
  DECISION_NAMES,
  DECISIONS,
  emptyLine,
  forPlace,
  knownPlace,
  placeParam,
  RULES,
  within,
} from "@/lib/findings/core";
import { sideFromBloc } from "@/lib/path-view";

const ABOUT =
  "What the figures say about where to spend time, what to say where, where to put field work and money, and how to answer rivals and polls.";
/** Findings shown for each rule before "Show more". */
const SHOWN = 5;

export const Route = createFileRoute("/_authenticated/strategy")({
  component: Strategy,
  // ?place=nairobi/dagoretti-north: that place's findings and its parts', and the campaign's.
  validateSearch: (search: Record<string, unknown>): { place?: string } => {
    const place = placeParam(search["place"]);
    return place ? { place } : {};
  },
  head: () => ({
    meta: [
      { title: "Strategy · Groundwork" },
      { name: "description", content: ABOUT },
      { property: "og:title", content: "Strategy · Groundwork" },
      { property: "og:description", content: ABOUT },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Strategy() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { campaign } = useAccess();
  const { data, isError, refetch } = useFindings();
  const fetchAtlas = useServerFn(getAtlas);
  const { data: atlas, isPending: atlasPending } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState<string[]>([]);
  const place = knownPlace(search.place, atlas?.areas);

  const home = atlas ? homeAreaFor(campaign, atlas.homeArea, atlas.areas) : null;
  const homeName = atlas?.areas.find((a) => a.key === home)?.name ?? "your area";
  const places =
    atlas && home
      ? atlas.areas
          .filter((a) => a.key !== home && a.level !== "country" && within(home, a.key))
          .sort((a, b) => a.key.localeCompare(b.key))
      : [];

  if (isError)
    return (
      <section className="view active" aria-label="Strategy">
        <div className="card">
          <h2>Couldn't load the findings. Try again.</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </section>
    );

  const shown = data ? forPlace(data.findings, place) : [];
  let n = 0;
  return (
    <section className="view active" aria-label="Strategy">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Operate · Strategy</span>
          <h1>What the numbers say</h1>
          <p className="meta">
            {data
              ? `Worked out at ${new Date(data.asOf).toLocaleTimeString("en-KE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Africa/Nairobi",
                })}. `
              : "Working out the findings… "}
            They change as the figures do.
          </p>
        </div>
        <label className="vh-side fd-place">
          <span>Place</span>
          <select
            value={place ?? ""}
            onChange={(e) => navigate({ search: e.target.value ? { place: e.target.value } : {} })}
          >
            <option value="">All of {homeName}</option>
            {places.map((a) => (
              <option key={a.key} value={a.key}>
                {a.level === "ward" ? `— ${a.name}` : a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data?.waiting.length ? (
        <p className="f-note fd-waiting">
          Some findings are waiting for a database update and show once it's applied.
        </p>
      ) : null}
      {data
        ? DECISIONS.map((d) => {
            const mine = shown.filter((f) => f.decision === d);
            const items: ReactNode[] = [];
            for (const r of RULES.filter((x) => x.decision === d)) {
              const all = mine.filter((f) => f.rule === r.id);
              const seen = open.includes(r.id) ? all : all.slice(0, SHOWN);
              for (const f of seen) items.push(<FindingItem key={f.id} f={f} n={++n} />);
              if (all.length > seen.length)
                items.push(
                  <li key={`${r.id}-more`} className="fd-more">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setOpen([...open, r.id])}
                    >
                      Show {all.length - seen.length} more
                    </button>
                  </li>,
                );
            }
            return (
              <section key={d} className="card fd-group" aria-labelledby={`fd-${d}`}>
                <div className="card-head">
                  <h2 id={`fd-${d}`}>{DECISION_NAMES[d]}</h2>
                </div>
                {items.length ? (
                  <ol className="fd-list">{items}</ol>
                ) : (
                  <p className="f-note">{emptyLine(d, data)}</p>
                )}
              </section>
            );
          })
        : null}
      {
        // Once the atlas has answered, so the side it names is there from the first sight of the section.
        atlasPending ? null : (
          <PathToStateHouse
            president={campaign?.level === "president"}
            startSide={sideFromBloc(atlas?.sides["2022-president"])}
          />
        )
      }
    </section>
  );
}
