// The panel beside the Voters map (a sheet on phones): the area's five numbers
// and what happened here last time, then its doors (houses knocked, support
// found, doors this week, agents out today) and "Do this next", the wards with
// the most houses not knocked in 30 days. In a ward, the way down to its houses.
// An open house's card comes first: on a phone the sheet shows the panel's top.

import type { ReactNode } from "react";

import { LastTimeHere } from "@/components/gw/voters/LastTimeHere";
import { PlaceFindings } from "@/components/gw/findings/SoWhat";
import { useFindings } from "@/hooks/useFindings";
import type { CanvassData } from "@/lib/console.functions";
import { votersPlace } from "@/lib/findings/core";
import { doorsFirst, doorTotals, type WardDoors } from "@/lib/houses";
import type { Level } from "@/lib/voters-map";
import type { ListSummary } from "@/lib/walk-lists.functions";
import {
  areaNumbers,
  doorIssues,
  share,
  targetWords,
  toFind,
  wardsIn,
  type Area,
  type SearchChanges,
  type WardInfo,
} from "@/lib/voters-view";
import { nf } from "@/lib/format";

type Figure = { label: string; value: string; note: string; open?: () => void };

export function MapPanel({
  area,
  wards,
  canvass,
  doors,
  houses,
  level,
  isAgent,
  onArea,
  onSearch,
  card,
  centres,
  walkLists,
  walkListsList,
  onPlan,
}: {
  area: Area;
  wards: WardInfo[];
  canvass: CanvassData | null;
  /** Doors per ward: undefined while they're read, null when they can't be (the update isn't in). */
  doors: WardDoors[] | null | undefined;
  /** Houses on the map per ward slug; empty without a house file. */
  houses: Record<string, number>;
  /** The map's level: at street level the houses are on show. */
  level: Level;
  isAgent: boolean;
  onArea: (a: Area) => void;
  /** Opens the People tab with its filters; agents don't get it. */
  onSearch: (changes: SearchChanges) => void;
  /** The open house's, or centre's, card. */
  card?: ReactNode;
  /** The ward's polling centres. */
  centres?: ReactNode;
  /** The ward's open walk lists, for the count in Doors: undefined while read, null when they can't be. */
  walkLists?: ListSummary[] | null | undefined;
  /** The ward's open walk lists as a section of their own. */
  walkListsList?: ReactNode;
  /** Starts a walk list from the ward (street level, staff); left out otherwise. */
  onPlan?: () => void;
}) {
  const inside = wardsIn(area, wards);
  const n = areaNumbers(area, wards, canvass?.wards ?? [], canvass?.unplaced);
  const figures: Figure[] = [
    {
      label: "Registered voters",
      value: nf.format(n.registered),
      note: `${inside.length} ${inside.length === 1 ? "ward" : "wards"} on the register`,
    },
    {
      label: "People on file",
      value: nf.format(n.onFile),
      note: n.registered
        ? `${share(n.onFile / n.registered)} of the register`
        : "on the campaign's records",
      ...(isAgent
        ? {}
        : {
            open: () =>
              onSearch({
                tab: "people",
                support: undefined,
                consent: undefined,
                contact: undefined,
              }),
          }),
    },
    {
      label: "Supporters found",
      value: nf.format(n.supporters),
      note: n.target
        ? `${share(n.supporters / toFind(n.target))} of the ${nf.format(toFind(n.target))} to find`
        : "no target set",
      ...(isAgent ? {} : { open: () => onSearch({ tab: "people", support: "strong" }) }),
    },
    {
      label: "Doors · 30 days",
      value: canvass ? nf.format(n.doors) : "—",
      note: "knocked, answered or not",
    },
    {
      label: "Coverage",
      value: canvass && n.coverage !== null ? share(n.coverage) : "—",
      note: "of people on file seen in 30 days",
    },
  ];
  const t = doors ? doorTotals(inside, houses, doors) : null;
  const next = doors && area.level !== "ward" ? doorsFirst(inside, houses, doors) : [];
  const issues = canvass ? doorIssues(canvass.wards, area, wards, 5) : [];

  return (
    <>
      {card}
      <div className="ladder vt-numbers">
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
      {targetWords(n) ? (
        <details className="vt-why">
          <summary>How the {nf.format(toFind(n.target))} is worked out</summary>
          <p>{targetWords(n)}</p>
        </details>
      ) : null}

      {isAgent ? null : <LastTimeHere area={area} wards={wards} />}
      {isAgent ? null : <VotersFindings area={area} wards={wards} />}

      <section aria-label="Doors">
        <div className="card-head">
          <h2>Doors</h2>
          <span className="mono">houses on the map · 30 days</span>
        </div>
        {doors === undefined ? (
          <p className="meta">Reading the doors…</p>
        ) : t === null ? (
          <p className="meta">
            The house data isn't in yet: houses knocked are counted once the database update is
            applied.
          </p>
        ) : (
          <div className="f-rows">
            <div className="f-row">
              <span>Houses knocked</span>
              <b>
                {t.houses
                  ? `${nf.format(t.knocked)} of ${nf.format(t.houses)} · ${share(t.knocked / t.houses)}`
                  : nf.format(t.knocked)}
              </b>
            </div>
            <div className="f-row">
              <span>Supporters among doors scored</span>
              <b>
                {t.rated
                  ? `${nf.format(t.supporters)} of ${nf.format(t.rated)}`
                  : "none scored yet"}
              </b>
            </div>
            <div className="f-row">
              <span>Doors this week</span>
              <b>{nf.format(t.doorsWeek)}</b>
            </div>
            <div className="f-row">
              <span>Agents out today</span>
              <b>{nf.format(t.agentsToday)}</b>
            </div>
            {walkLists ? (
              <div className="f-row">
                <span>Walk lists out</span>
                <b>{nf.format(walkLists.filter((l) => l.status === "out").length)}</b>
              </div>
            ) : null}
          </div>
        )}
        {onPlan ? (
          <div className="vhouse-actions pw-start">
            <button type="button" className="btn btn--primary btn--sm" onClick={onPlan}>
              Plan a walk list
            </button>
          </div>
        ) : null}
        {area.level === "ward" && level !== "street" ? (
          <p className="f-note">Zoom in to street level to see each house.</p>
        ) : null}
      </section>

      {centres}
      {walkListsList}

      {area.level !== "ward" && t ? (
        <section className="vnext" aria-label="Do this next">
          <div className="card-head">
            <h2>Do this next</h2>
            <span className="mono">most houses not knocked</span>
          </div>
          {next.length ? (
            next.map((r) => (
              <div className="vnext-row" key={r.wardId}>
                <div className="vnext-what">
                  <span className="vtag">Doors first</span>
                  <b>{r.name} ward</b>
                  <span className="meta">
                    {nf.format(r.notKnocked)} of {nf.format(r.houses)} houses not knocked in 30 days
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => onArea({ level: "ward", slug: r.slug })}
                >
                  Open the ward
                </button>
              </div>
            ))
          ) : (
            <p className="meta">No houses on the map for these wards yet.</p>
          )}
        </section>
      ) : null}

      {issues.length ? (
        <section aria-label="Raised at the door">
          <div className="card-head">
            <h2>Raised at the door</h2>
            <span className="mono">from conversations</span>
          </div>
          <div className="f-rows">
            {issues.map((i) => (
              <div className="f-row" key={i.name}>
                <span>{i.name}</span>
                <b>{nf.format(i.count)}</b>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** The map's few field and message findings for the area in view; none for a place the atlas doesn't hold. */
function VotersFindings({ area, wards }: { area: Area; wards: WardInfo[] }) {
  const { data } = useFindings();
  const place = data ? votersPlace(area, wards, data.wardKeys) : undefined;
  if (place === undefined) return null;
  return <PlaceFindings place={place} max={3} decisions={["field", "message"]} card={false} />;
}
