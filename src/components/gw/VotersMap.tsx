import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { WardMap, type Basemap, type Pin, type Tool, type WardsGeo } from "@/components/gw/WardMap";
import type { VotersData } from "@/lib/console.functions";
import { boundsOf, toBuildings } from "@/lib/geo";
import { buildingsIndexQuery, getJson, wardBuildingsQuery } from "@/lib/geo-files";
import { getMapConfig, getWardMap } from "@/lib/map.functions";
import {
  aggregate,
  band,
  BAND_COLOUR,
  issueColour,
  issueKey,
  STATUS,
  statusOf,
  summarise,
  type BuildingStats,
  type Status,
  type WardMapRow,
} from "@/lib/wardmap";

type Layer = "status" | "support" | "issue";
type HouseFilter = "all" | "sup" | "und" | "new";

const LAYERS: { key: Layer; label: string }[] = [
  { key: "status", label: "Canvass" },
  { key: "support", label: "Support" },
  { key: "issue", label: "Issue" },
];
const OUTCOME: Record<string, string> = {
  spoke: "Spoke",
  not_home: "Not home",
  refused: "Refused",
};

const nf = new Intl.NumberFormat("en-KE");
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "";

function colourFor(layer: Layer, s: BuildingStats): string {
  if (layer === "support") {
    const b = Math.round(s.avgBand);
    return b >= 1 && b <= 5 ? BAND_COLOUR[b as 1 | 2 | 3 | 4 | 5] : STATUS.none.colour;
  }
  if (layer === "issue") return s.topIssue ? issueColour(s.topIssue) : STATUS.none.colour;
  return STATUS[s.status].colour;
}

function pinColour(layer: Layer, r: WardMapRow): string {
  const b = band(r.support);
  if (layer === "support") return b ? BAND_COLOUR[b] : STATUS.none.colour;
  if (layer === "issue") return r.lastIssue ? issueColour(r.lastIssue) : STATUS.none.colour;
  const s: Status = statusOf({
    households: 1,
    knocked: r.lastOutcome ? 1 : 0,
    rated: r.lastOutcome && b ? 1 : 0,
    avgBand: b,
  });
  return STATUS[s].colour;
}

export function VotersMap({
  wards,
  totals,
}: {
  wards: VotersData["wards"];
  totals: VotersData["totals"];
}) {
  const fetchConfig = useServerFn(getMapConfig);
  const fetchWardMap = useServerFn(getWardMap);

  const { data: config } = useQuery({
    queryKey: ["map-config"],
    queryFn: () => fetchConfig(),
    staleTime: Infinity,
  });
  const { data: wardsGeo, isError: geoFailed } = useQuery({
    queryKey: ["geo", "wards"],
    queryFn: () => getJson<WardsGeo>("/geo/nairobi-wards.json"),
    staleTime: Infinity,
  });
  const { data: index } = useQuery(buildingsIndexQuery);

  const [slug, setSlug] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [tilesRefused, setTilesRefused] = useState(false);
  const [layer, setLayer] = useState<Layer>("status");
  const [tool, setTool] = useState<Tool>("pan");
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [houses, setHouses] = useState<HouseFilter>("all");

  const ward = wards.find((w) => w.slug === slug) ?? null;
  const hasBuildings = Boolean(slug && index?.wards[slug]);

  const { data: buildings, isFetching: buildingsLoading } = useQuery({
    ...wardBuildingsQuery(slug ?? ""),
    enabled: hasBuildings,
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["ward-map", ward?.id],
    queryFn: () => fetchWardMap({ data: { wardId: ward!.id } }),
    enabled: Boolean(ward),
  });

  // A new ward starts clean.
  useEffect(() => {
    setSelection(new Set());
    setFocus(null);
    setTool("pan");
    setHouses("all");
  }, [slug]);

  const satelliteOk = Boolean(config?.maptilerKey) && !tilesRefused;
  const shown: Basemap = satelliteOk ? basemap : "streets";
  const key = tilesRefused ? null : (config?.maptilerKey ?? null);

  const wardBuildings = hasBuildings ? (buildings ?? null) : null;
  const buildingList = useMemo(
    () => (wardBuildings ? toBuildings(wardBuildings) : []),
    [wardBuildings],
  );
  const areaOf = useMemo(() => new Map(buildingList.map((b) => [b.id, b.area])), [buildingList]);
  const stats = useMemo(() => aggregate(rows), [rows]);
  const colours = useMemo(
    () => new Map([...stats.entries()].map(([id, s]) => [id, colourFor(layer, s)])),
    [stats, layer],
  );
  const pins: Pin[] = useMemo(
    () =>
      rows
        .filter((r) => !r.buildingId && r.lat !== null && r.lng !== null)
        .map((r) => ({ id: r.id, lat: r.lat!, lng: r.lng!, colour: pinColour(layer, r) })),
    [rows, layer],
  );
  const coverage = useMemo(
    () =>
      Object.fromEntries(
        wards.map((w) => [w.slug, w.target ? Math.min(w.supporters / w.target, 1) : 0]),
      ),
    [wards],
  );
  const wardFeature = wardsGeo?.features.find((f) => f.properties.slug === slug) ?? null;
  const wardBox = useMemo(
    () => (wardFeature ? boundsOf(wardFeature.geometry) : null),
    [wardFeature],
  );

  const pinnedTotal = wards.reduce((s, w) => s + w.pinned, 0);
  const knocked = rows.filter((r) => r.lastOutcome !== null);
  const answered = rows.filter((r) => r.lastOutcome === "spoke");
  const supporters = rows.filter((r) => band(r.support) >= 4);
  const sel = summarise(selection, stats);

  const issues = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = issueKey(r.lastIssue);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  const worst = useMemo(
    () =>
      wards
        .map((w) => ({ ...w, gap: Math.max(w.target - w.supporters, 0) }))
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 10),
    [wards],
  );

  const focusRows = focus ? rows.filter((r) => r.buildingId === focus) : [];
  const focusStats = focus ? stats.get(focus) : undefined;
  const houseRows = focusRows.filter((h) =>
    houses === "sup"
      ? band(h.support) >= 4
      : houses === "und"
        ? band(h.support) === 3
        : houses === "new"
          ? !h.lastOutcome
          : true,
  );

  const legend: { label: string; colour: string; round?: boolean }[] = !ward
    ? [
        { label: "Far from win number", colour: "hsl(0, 72%, 52%)" },
        { label: "Halfway", colour: "hsl(40, 92%, 52%)" },
        { label: "At the win number", colour: "hsl(142, 62%, 40%)" },
      ]
    : layer === "status"
      ? (Object.keys(STATUS) as Status[]).map((k) => ({
          label: STATUS[k].label,
          colour: STATUS[k].colour,
        }))
      : layer === "support"
        ? [
            { label: "1 against", colour: BAND_COLOUR[1] },
            { label: "3", colour: BAND_COLOUR[3] },
            { label: "5 strong", colour: BAND_COLOUR[5] },
            { label: "Unknown", colour: STATUS.none.colour },
          ]
        : [
            ...issues.map(([k]) => ({ label: k, colour: issueColour(k) })),
            { label: "None raised", colour: STATUS.none.colour },
          ];

  function selectBox(ids: string[], add: boolean) {
    setSelection((cur) => {
      const next = add ? new Set(cur) : new Set<string>();
      for (const id of ids) next.add(id);
      return next;
    });
  }
  function toggle(id: string) {
    setSelection((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="card fx2" style={{ padding: "16px 20px" }}>
        <nav className="crumbs" aria-label="Geography">
          {ward ? (
            <>
              <button type="button" onClick={() => setSlug(null)}>
                Nairobi County
              </button>
              <span className="sep">/</span>
              <span className="dim">{ward.constituency}</span>
              <span className="sep">/</span>
              <b>{ward.name} ward</b>
            </>
          ) : (
            <b>Nairobi County</b>
          )}
          <span className="mono dim" style={{ marginLeft: "auto" }}>
            {ward
              ? wardBuildings
                ? `${nf.format(buildingList.length)} structures · outlines from Google Open Buildings`
                : buildingsLoading
                  ? "loading building outlines…"
                  : "building outlines not loaded for this ward yet"
              : `${wards.length} wards · tap one to drop in`}
          </span>
        </nav>
      </div>

      {ward ? (
        <div className="ladder fx2" style={{ marginTop: 14 }}>
          <div>
            <span className="l">Structures</span>
            <span className="n stat">{wardBuildings ? nf.format(buildingList.length) : "—"}</span>
            <span className="s">
              {wardBuildings ? "rooftops mapped from imagery" : "outlines not loaded yet"}
            </span>
          </div>
          <div>
            <span className="l">Households pinned</span>
            <span className="n stat">{nf.format(rows.length)}</span>
            <span className="s">of {nf.format(ward.people)} people on file here</span>
          </div>
          <div>
            <span className="l">Doors knocked</span>
            <span className="n stat">{nf.format(knocked.length)}</span>
            <span className="s">{pct(knocked.length, rows.length)} of pinned households</span>
          </div>
          <div>
            <span className="l">Supporters 4–5</span>
            <span className="n stat">{nf.format(supporters.length)}</span>
            <span className="s">{pct(supporters.length, answered.length)} of doors answered</span>
          </div>
          <div>
            <span className="l">Contacted this week</span>
            <span className="n stat">{nf.format(ward.contacted)}</span>
            <span className="s">SMS · calls · doors</span>
          </div>
        </div>
      ) : (
        <div className="ladder fx2" style={{ marginTop: 14 }}>
          <div>
            <span className="l">Wards</span>
            <span className="n stat">{nf.format(wards.length)}</span>
            <span className="s">
              {nf.format(wards.filter((w) => w.pinned > 0).length)} with households pinned
            </span>
          </div>
          <div>
            <span className="l">Registered voters</span>
            <span className="n stat">{nf.format(totals.registered)}</span>
            <span className="s">across the county</span>
          </div>
          <div>
            <span className="l">Supporters found</span>
            <span className="n stat">{nf.format(totals.supporters)}</span>
            <span className="s">{pct(totals.supporters, totals.target)} of the win number</span>
          </div>
          <div>
            <span className="l">People on file</span>
            <span className="n stat">{nf.format(totals.people)}</span>
            <span className="s">{nf.format(pinnedTotal)} pinned on the map</span>
          </div>
          <div>
            <span className="l">Contacted this week</span>
            <span className="n stat">{nf.format(totals.contactedWeek)}</span>
            <span className="s">SMS · calls · doors</span>
          </div>
        </div>
      )}

      {!satelliteOk && config && (
        <p className="f-note" role="status">
          {tilesRefused
            ? "MapTiler turned the key down, so the map is showing OpenFreeMap streets. Check the key and its allowed domains in MapTiler."
            : "Satellite needs a MapTiler key: add MAPTILER_KEY to the project's secrets in Lovable. Streets come from OpenFreeMap meanwhile."}
        </p>
      )}

      <div className="vgrid fx3">
        <div style={{ minWidth: 0 }}>
          {wardsGeo ? (
            <WardMap
              maptilerKey={key}
              basemap={shown}
              wards={wardsGeo}
              coverage={coverage}
              selectedWard={slug}
              wardBox={wardBox}
              buildings={wardBuildings}
              buildingList={buildingList}
              colours={colours}
              selection={selection}
              focus={focus}
              pins={pins}
              tool={tool}
              onWard={setSlug}
              onBuilding={setFocus}
              onToggle={toggle}
              onSelectBox={selectBox}
              onTilesRefused={() => setTilesRefused(true)}
            >
              <div className="vtop">
                <div className="vglass vseg" role="group" aria-label="Basemap">
                  <button
                    type="button"
                    aria-pressed={shown === "satellite"}
                    disabled={!satelliteOk}
                    title={satelliteOk ? undefined : "Needs a MapTiler key"}
                    onClick={() => setBasemap("satellite")}
                  >
                    Satellite
                  </button>
                  <button
                    type="button"
                    aria-pressed={shown === "streets"}
                    onClick={() => setBasemap("streets")}
                  >
                    Streets
                  </button>
                </div>
                {ward && (
                  <div className="vglass vseg" role="group" aria-label="Colour buildings by">
                    {LAYERS.map((l) => (
                      <button
                        key={l.key}
                        type="button"
                        aria-pressed={layer === l.key}
                        onClick={() => setLayer(l.key)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="spacer" />
                {ward && wardBuildings && (
                  <div className="vglass vseg" role="group" aria-label="Map tool">
                    <button
                      type="button"
                      aria-pressed={tool === "pan"}
                      onClick={() => setTool("pan")}
                    >
                      Pan
                    </button>
                    <button
                      type="button"
                      aria-pressed={tool === "select"}
                      onClick={() => setTool("select")}
                    >
                      Select area
                    </button>
                  </div>
                )}
              </div>
              <div className="vglass vleg">
                {legend.map((it) => (
                  <span key={it.label}>
                    <i style={{ background: it.colour }} />
                    {it.label}
                  </span>
                ))}
              </div>
            </WardMap>
          ) : (
            <div className="vmap">
              <p className="vmap-loading meta">
                {geoFailed
                  ? "Could not load the ward boundaries. Try reloading."
                  : "Loading the map…"}
              </p>
            </div>
          )}

          {selection.size > 0 && (
            <div className="tray" role="region" aria-label="Selected area">
              <div className="grp">
                <div>
                  <span className="t-l">Selected</span>
                  <b className="stat">{nf.format(sel.structures)}</b>{" "}
                  <span className="dim" style={{ color: "hsl(150 11% 66%)" }}>
                    structures
                  </span>
                </div>
                <div>
                  <span className="t-l">Households</span>
                  <b className="stat">{nf.format(sel.households)}</b>
                </div>
                <div>
                  <span className="t-l">Reachable by SMS</span>
                  <b className="stat">{nf.format(sel.reachable)}</b>
                </div>
                <div>
                  <span className="t-l">Not yet knocked</span>
                  <b className="stat">{nf.format(sel.notKnocked)}</b>
                </div>
              </div>
              <span className="spacer" />
              <span className="tray-note">Walk lists and messages from a selection come next.</span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSelection(new Set())}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="vside">
          <div className="card" style={{ paddingTop: 12 }}>
            {!ward && (
              <>
                <div className="card-head" style={{ margin: "6px 0 4px" }}>
                  <h2>Where the gap is</h2>
                  <span className="mono">tap to fly there</span>
                </div>
                {worst.map((w) => (
                  <button key={w.slug} type="button" className="wl" onClick={() => setSlug(w.slug)}>
                    <span className="av" aria-hidden="true">
                      {w.name.slice(0, 2)}
                    </span>
                    <b>{w.name}</b>
                    <span className="mono">{pct(w.supporters, w.target)}</span>
                    <small>
                      {w.constituency} · {nf.format(w.gap)} short of the win number ·{" "}
                      {nf.format(w.pinned)} pinned
                    </small>
                    <span className="minibar">
                      <i
                        style={{
                          width: `${w.target ? Math.min((w.supporters / w.target) * 100, 100) : 0}%`,
                        }}
                      />
                    </span>
                  </button>
                ))}
                <p className="f-note">Shaded by supporters found against each ward's win number.</p>
              </>
            )}

            {ward && !focus && (
              <>
                <div className="card-head" style={{ margin: "6px 0 4px" }}>
                  <h2>{ward.name}</h2>
                  <span className="mono">{ward.constituency}</span>
                </div>
                <div className="bp-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                  <div>
                    <span>Pinned</span>
                    <b>{nf.format(rows.length)}</b>
                  </div>
                  <div>
                    <span>Knocked</span>
                    <b>{nf.format(knocked.length)}</b>
                  </div>
                  <div>
                    <span>Supporters</span>
                    <b>{nf.format(supporters.length)}</b>
                  </div>
                  <div>
                    <span>SMS reachable</span>
                    <b>{nf.format(rows.filter((r) => r.smsOk).length)}</b>
                  </div>
                  <div>
                    <span>Not knocked</span>
                    <b>{nf.format(rows.length - knocked.length)}</b>
                  </div>
                  <div>
                    <span>Not pinned</span>
                    <b>{nf.format(Math.max(ward.people - rows.length, 0))}</b>
                  </div>
                </div>
                {issues.length > 0 && (
                  <div className="f-rows" style={{ marginTop: 12 }}>
                    {issues.map(([k, n]) => (
                      <div className="f-row" key={k}>
                        <span>
                          <i
                            className="vdot"
                            style={{ background: issueColour(k) }}
                            aria-hidden="true"
                          />{" "}
                          {k}
                        </span>
                        <b>{nf.format(n)}</b>
                      </div>
                    ))}
                  </div>
                )}
                <p className="f-note">
                  {rows.length === 0
                    ? "Nobody is pinned here yet. Households appear as agents record visits in the field app, with the building they were at."
                    : wardBuildings
                      ? "Tap a building to see who lives there. Use Select area to gather a street."
                      : "Building outlines for this ward aren't on the map yet; households pinned by GPS show as dots."}
                </p>
              </>
            )}

            {ward && focus && (
              <>
                <div className="card-head" style={{ margin: "6px 0 0", alignItems: "flex-start" }}>
                  <div>
                    <span className="eyebrow">Building · {focus}</span>
                    <h3 style={{ marginTop: 4, fontSize: 17 }}>
                      {areaOf.get(focus)
                        ? `${nf.format(areaOf.get(focus)!)} m² footprint`
                        : "Building"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setFocus(null)}
                  >
                    Back
                  </button>
                </div>
                <div className="bp-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                  <div>
                    <span>Households</span>
                    <b>{nf.format(focusStats?.households ?? 0)}</b>
                  </div>
                  <div>
                    <span>Knocked</span>
                    <b>{nf.format(focusStats?.knocked ?? 0)}</b>
                  </div>
                  <div>
                    <span>Supporters</span>
                    <b>{nf.format(focusStats?.supporters ?? 0)}</b>
                  </div>
                </div>
                {focusStats && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <span className="pill pill--muted">{STATUS[focusStats.status].label}</span>
                    {focusStats.topIssue && (
                      <span className="pill pill--muted">Top issue · {focusStats.topIssue}</span>
                    )}
                  </div>
                )}
                {focusRows.length > 0 ? (
                  <>
                    <div className="vtabs" style={{ marginTop: 14 }}>
                      {(
                        [
                          ["all", "All", focusRows.length],
                          [
                            "sup",
                            "Supporters",
                            focusRows.filter((h) => band(h.support) >= 4).length,
                          ],
                          [
                            "und",
                            "Undecided",
                            focusRows.filter((h) => band(h.support) === 3).length,
                          ],
                          ["new", "Not knocked", focusRows.filter((h) => !h.lastOutcome).length],
                        ] as const
                      ).map(([k, label, n]) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={houses === k}
                          onClick={() => setHouses(k)}
                        >
                          {label}
                          <span className="n">{n}</span>
                        </button>
                      ))}
                    </div>
                    <div className="hhs">
                      {houseRows.map((h) => {
                        const b = band(h.support);
                        return (
                          <div className="hh2" key={h.id}>
                            <span
                              className="sc"
                              style={{ background: b ? BAND_COLOUR[b] : "hsl(150, 6%, 70%)" }}
                            >
                              {b || "–"}
                            </span>
                            <span>
                              <b>{h.name}</b>
                            </span>
                            <span className="acts">
                              <Link
                                to="/people"
                                search={{ person: h.id }}
                                className="icon-btn"
                                aria-label={`Open ${h.name}'s record`}
                              >
                                →
                              </Link>
                            </span>
                            <small>
                              <span className="ph">{h.phoneMasked}</span>
                              {h.lastOutcome
                                ? ` · ${OUTCOME[h.lastOutcome]} ${day(h.lastVisitAt)}`
                                : " · not knocked"}
                              {h.lastIssue ? ` · ${h.lastIssue}` : ""}
                              {h.optedOut ? " · opted out" : ""}
                            </small>
                          </div>
                        );
                      })}
                      {houseRows.length === 0 && (
                        <p className="meta" style={{ padding: "8px 0" }}>
                          No one in this filter.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="f-note">
                    No one recorded at this building yet. Agents pin households here when they log a
                    visit at this door.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
