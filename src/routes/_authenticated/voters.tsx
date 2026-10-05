import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useState } from "react";

import { AddPerson } from "@/components/gw/AddPerson";
import { VotersMap } from "@/components/gw/VotersMap";
import { DoorsView } from "@/components/gw/voters/DoorsView";
import { ManageRecords } from "@/components/gw/voters/ManageRecords";
import { PeopleView } from "@/components/gw/voters/PeopleView";
import { WardsView } from "@/components/gw/voters/WardsView";
import { useAccess } from "@/hooks/useAccess";
import { getCanvassing, getPeople, getVoters, type CanvassData } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";
import {
  areaNumbers,
  areaParam,
  areaTitle,
  broadcastSearch,
  crumbsOf,
  inArea,
  matchPerson,
  nextSearch,
  parseArea,
  share,
  stepFor,
  validateVotersSearch,
  viewOf,
  viewsFor,
  wardsIn,
  type Area,
  type SearchChanges,
  type VotersView,
  type WardInfo,
} from "@/lib/voters-view";

const ABOUT =
  "Pick an area, from the county to a ward: its people, its doors and its numbers, on one map.";

export const Route = createFileRoute("/_authenticated/voters")({
  component: Voters,
  // ?area=w:kileleshwa&view=people&support=strong: the slice on show, so a link opens it.
  validateSearch: validateVotersSearch,
  head: () => ({
    meta: [
      { title: "Voters · Groundwork" },
      { name: "description", content: ABOUT },
      { property: "og:title", content: "Voters · Groundwork" },
      { property: "og:description", content: ABOUT },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const VIEW_NAMES: Record<VotersView, string> = { people: "People", doors: "Doors", wards: "Wards" };

/** The area's walk list as a CSV for a canvasser. */
function exportWalk(canvass: CanvassData | null, area: Area, wards: WardInfo[], placeName: string) {
  const walk = (canvass?.walkList ?? []).filter((p) => inArea(p.ward, area, wards));
  downloadCSV(
    stampName(`groundwork-walk-list-${placeName.toLowerCase().replace(/\s+/g, "-")}`),
    [
      "Name",
      "Phone",
      "Ward",
      "Group",
      "Support score",
      "Last contacted",
      "Why they are on the list",
    ],
    walk.map((p) => [
      p.name,
      p.phone,
      p.ward ?? "",
      p.segment ?? "",
      p.support,
      p.lastTouch ? p.lastTouch.slice(0, 10) : "never",
      p.reason,
    ]),
  );
}

type Figure = { label: string; value: string; note: string; open?: () => void };

function Voters() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { access, isPrincipal } = useAccess();
  const isAgent = access?.role === "agent";
  const fetchVoters = useServerFn(getVoters);
  const fetchPeople = useServerFn(getPeople);
  const fetchCanvassing = useServerFn(getCanvassing);
  const { data } = useQuery({ queryKey: ["voters"], queryFn: () => fetchVoters() });
  // The People list isn't on an agent's screen, so it isn't fetched for them.
  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => fetchPeople(),
    enabled: Boolean(access) && !isAgent,
  });
  const { data: canvass } = useQuery({
    queryKey: ["canvassing"],
    queryFn: () => fetchCanvassing(),
  });
  const [adding, setAdding] = useState(false);

  const wards = useMemo(() => data?.wards ?? [], [data]);
  const rows = useMemo(() => {
    const a = parseArea(search.area, wards);
    const now = Date.now();
    return (people?.rows ?? []).filter((r) => matchPerson(r, a, wards, search, now));
  }, [people, wards, search]);

  const go = (changes: SearchChanges) =>
    void navigate({ search: (prev) => nextSearch(prev, changes), ...stepFor(changes) });
  const setArea = (a: Area) => go({ area: areaParam(a), person: undefined });

  if (!data) {
    return (
      <section className="view active" aria-label="Voters">
        <div className="vh">
          <div>
            <span className="eyebrow">Voters · county to doorstep</span>
            <h1>Nairobi County</h1>
            <p className="meta">Loading the wards…</p>
          </div>
        </div>
      </section>
    );
  }

  const area = parseArea(search.area, wards);
  const views = viewsFor(isAgent, area);
  const view = viewOf(search, isAgent, area);
  const title = areaTitle(area, wards);
  const crumbs = crumbsOf(area, wards);
  const inside = wardsIn(area, wards);
  const n = areaNumbers(area, wards, canvass?.wards ?? [], canvass?.unplaced);
  const record = search.person ? (people?.rows.find((r) => r.id === search.person) ?? null) : null;
  const toWard = (slug: string) => setArea({ level: "ward", slug });

  const figures: Figure[] = [
    {
      label: "Registered voters",
      value: nf.format(n.registered),
      note: `${inside.length} ${inside.length === 1 ? "ward" : "wards"} on the register`,
      ...(views.includes("wards") ? { open: () => go({ view: "wards" }) } : {}),
    },
    {
      label: "People on file",
      value: nf.format(n.onFile),
      note: n.registered
        ? `${share(n.onFile / n.registered)} of the register`
        : "on the campaign's records",
      ...(views.includes("people")
        ? {
            open: () =>
              go({ view: "people", support: undefined, consent: undefined, contact: undefined }),
          }
        : {}),
    },
    {
      label: "Supporters found",
      value: nf.format(n.supporters),
      note: n.target
        ? `${share(n.supporters / n.target)} of the ${nf.format(n.target)} needed`
        : "no target set",
      ...(views.includes("people")
        ? { open: () => go({ view: "people", support: "strong" }) }
        : {}),
    },
    {
      label: "Doors · 30 days",
      value: canvass ? nf.format(n.doors) : "—",
      note: "knocked, answered or not",
      open: () => go({ view: "doors" }),
    },
    {
      label: "Coverage",
      value: canvass && n.coverage !== null ? share(n.coverage) : "—",
      note: "of people on file seen in 30 days",
      open: () => go({ view: "doors" }),
    },
  ];

  return (
    <section className="view active" aria-label="Voters">
      {adding && people && (
        <AddPerson
          wards={people.wards}
          segments={people.segments}
          onClose={() => {
            setAdding(false);
            void queryClient.invalidateQueries({ queryKey: ["voters"] });
          }}
        />
      )}
      {search.manage && !isAgent && people && (
        <ManageRecords
          data={people}
          canImport={isPrincipal}
          onClose={() => go({ manage: undefined })}
        />
      )}

      <div className="vh fx">
        <div>
          <span className="eyebrow">Voters · county to doorstep</span>
          <h1>{title}</h1>
          {crumbs.length > 1 ? (
            <nav className="crumbs" aria-label="Area">
              {crumbs.slice(0, -1).map((c) => (
                <Fragment key={c.label}>
                  <button type="button" onClick={() => setArea(c.area)}>
                    {c.label}
                  </button>
                  <span className="sep">/</span>
                </Fragment>
              ))}
              <b aria-current="page">{title}</b>
            </nav>
          ) : (
            <p className="meta">Pick a ward on the map to drop in; everything below follows it.</p>
          )}
        </div>
        <div className="vh-side vt-actions">
          {!isAgent && (
            <Link
              to="/broadcast"
              search={broadcastSearch(area, wards, search.support)}
              className="btn btn--primary btn--sm"
            >
              Message these people
            </Link>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!canvass}
            onClick={() => exportWalk(canvass ?? null, area, wards, title)}
          >
            Walk list · CSV
          </button>
          {!isAgent && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!people}
              onClick={() => setAdding(true)}
            >
              Add a person
            </button>
          )}
          {!isAgent && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => go({ manage: true })}
            >
              Manage records
            </button>
          )}
        </div>
      </div>

      <div className="ladder vt-numbers fx2" style={{ marginTop: 14 }}>
        {figures.map((f) => {
          const inner = (
            <>
              <span className="l">{f.label}</span>
              <span className="n stat">{f.value}</span>
              <span className="s">{f.note}</span>
            </>
          );
          return f.open ? (
            <button key={f.label} type="button" onClick={f.open}>
              {inner}
            </button>
          ) : (
            <div key={f.label}>{inner}</div>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <VotersMap
          wards={data.wards}
          totals={data.totals}
          slug={area.level === "ward" ? area.slug : null}
          onSlug={(slug) => {
            if (slug) toWard(slug);
            else setArea(crumbs[crumbs.length - 2]?.area ?? { level: "county" });
          }}
          bare
        />
      </div>

      <div className="vt-panel fx3">
        {views.length > 1 ? (
          <div className="seg" role="group" aria-label="Show">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => go({ view: v })}
              >
                {VIEW_NAMES[v]}
              </button>
            ))}
          </div>
        ) : null}
        {view === "people" ? (
          <PeopleView
            rows={rows}
            record={record}
            loading={!people}
            search={search}
            onSearch={go}
            placeName={title}
            segments={people?.segments ?? []}
          />
        ) : view === "doors" ? (
          <DoorsView
            area={area}
            wards={wards}
            canvass={canvass ?? null}
            onWard={toWard}
            {...(isAgent ? {} : { onPerson: (id: string) => go({ view: "people", person: id }) })}
          />
        ) : (
          <WardsView wards={inside} doors={canvass?.wards ?? []} onWard={toWard} />
        )}
      </div>
    </section>
  );
}
