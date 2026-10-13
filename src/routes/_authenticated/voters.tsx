// Voters: the campaign's map, from its whole area down to one house, with a
// panel of numbers and next steps beside it (a sheet on phones), and a People
// tab with the list for the area on show. The address holds the area, the
// house, the colour, the base map and the tab, so a link or a reload opens the
// same view. A click, a crumb, a link, Back or Forward flies the map there; a
// move the person makes on the map writes the address and isn't flown again.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from "react";

import { AddPerson } from "@/components/gw/AddPerson";
import { HouseCard } from "@/components/gw/voters/HouseCard";
import { ManageRecords } from "@/components/gw/voters/ManageRecords";
import { MapPanel } from "@/components/gw/voters/MapPanel";
import { MapSearch } from "@/components/gw/voters/MapSearch";
import { PeopleView } from "@/components/gw/voters/PeopleView";
import { Sheet } from "@/components/gw/voters/Sheet";
import { VotersCanvas, type WardsGeo } from "@/components/gw/voters/VotersCanvas";
import { useAccess } from "@/hooks/useAccess";
import { wardKey } from "@/lib/atlas-app";
import { getAtlas } from "@/lib/atlas.functions";
import { figuresFor, shadeLegend, shadeOf } from "@/lib/atlas-view";
import { getCanvassing, getPeople, getVoters, type CanvassData } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";
import { defaultRace } from "@/lib/elections-view";
import { wardAt, wardShapes } from "@/lib/geo";
import { getJson } from "@/lib/geo-files";
import {
  houseColour,
  houseLegend,
  NO_DATA,
  wardLegend,
  wardShade,
  type Colour,
  type LegendItem,
  type WardDoors,
} from "@/lib/houses";
import { getAreaDoors, getWardHouses } from "@/lib/houses.functions";
import { getMapConfig } from "@/lib/map.functions";
import { mapAreaFor, type HouseCounts, type MapArea } from "@/lib/map-areas";
import { plusCodeCentre } from "@/lib/pluscode";
import {
  cameraFor,
  hintFor,
  searchGo,
  type Basemap,
  type CameraTarget,
  type Level,
  type SearchHit,
} from "@/lib/voters-map";
import {
  areaParam,
  areaTitle,
  broadcastSearch,
  crumbsOf,
  inArea,
  matchPerson,
  nextSearch,
  parseArea,
  stepFor,
  validateVotersSearch,
  type Area,
  type Home,
  type SearchChanges,
  type VotersSearch,
  type WardInfo,
} from "@/lib/voters-view";

const ABOUT =
  "Pick an area, from the county down to one house: its people, its doors and its numbers, on one map.";

export const Route = createFileRoute("/_authenticated/voters")({
  component: Voters,
  // ?area=w:kileleshwa&house=6GCRPQM6+V9F4&colour=support: the view on show, so a link opens it.
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

/** A campaign with no map area: the People tab's top. */
const NO_MAP: Home = { name: "Every ward", top: "county" };
const COLOURS: { key: Colour; label: string }[] = [
  { key: "doors", label: "Doors" },
  { key: "support", label: "Support" },
  { key: "vote", label: "2022 vote" },
];

/** The area's people to see next, as a CSV for a canvasser. */
function exportPeople(canvass: CanvassData | null, area: Area, wards: WardInfo[], place: string) {
  const list = (canvass?.walkList ?? []).filter((p) => inArea(p.ward, area, wards));
  downloadCSV(
    stampName(`groundwork-people-list-${place.toLowerCase().replace(/\s+/g, "-")}`),
    [
      "Name",
      "Phone",
      "Ward",
      "Group",
      "Support score",
      "Last contacted",
      "Why they are on the list",
    ],
    list.map((p) => [
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

function Voters() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { access, isPrincipal } = useAccess();
  const isAgent = access?.role === "agent";
  const fetchVoters = useServerFn(getVoters);
  const fetchPeople = useServerFn(getPeople);
  const fetchCanvassing = useServerFn(getCanvassing);
  const fetchConfig = useServerFn(getMapConfig);
  const fetchDoors = useServerFn(getAreaDoors);
  const tab = search.tab === "people" && !isAgent ? "people" : "map";
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
  const { data: config, isError: configFailed } = useQuery({
    queryKey: ["map-config"],
    queryFn: () => fetchConfig(),
    staleTime: Infinity,
  });
  const mapArea = mapAreaFor(config?.mapArea);
  const { data: doors } = useQuery({
    queryKey: ["area-doors"],
    queryFn: () => fetchDoors(),
    enabled: tab === "map",
  });
  const { data: counts } = useQuery({
    queryKey: ["geo", mapArea?.id, "counts"],
    queryFn: () => getJson<HouseCounts>(mapArea!.counts),
    enabled: Boolean(mapArea),
    staleTime: Infinity,
  });
  const [adding, setAdding] = useState(false);
  const [level, setLevel] = useState<Level>("area");
  // The search box sits in the bar; the map, which owns the camera, takes what it picks.
  const pick = useRef<(hit: SearchHit) => void>(() => undefined);

  const wards = useMemo(() => data?.wards ?? [], [data]);
  const rows = useMemo(() => {
    const a = parseArea(search.area, wards);
    const now = Date.now();
    return (people?.rows ?? []).filter((r) => matchPerson(r, a, wards, search, now));
  }, [people, wards, search]);

  const go = (changes: SearchChanges) =>
    void navigate({ search: (prev) => nextSearch(prev, changes), ...stepFor(changes) });
  const setArea = (a: Area) => go({ area: areaParam(a), house: undefined, person: undefined });
  const home: Home = mapArea ? { name: mapArea.name, top: mapArea.top } : NO_MAP;

  if (!data || (!config && !configFailed)) {
    return (
      <section className="view active" aria-label="Voters">
        <div className="vh">
          <div>
            <span className="eyebrow">Voters · county to doorstep</span>
            <h1>{home.name}</h1>
            <p className="meta">Loading the wards…</p>
          </div>
        </div>
      </section>
    );
  }

  const area = parseArea(search.area, wards);
  const title = areaTitle(area, wards, home);
  const crumbs = crumbsOf(area, wards, home);
  const record = search.person ? (people?.rows.find((r) => r.id === search.person) ?? null) : null;
  const bar = (
    <Bar
      title={title}
      crumbs={crumbs}
      onArea={setArea}
      {...(isAgent
        ? {}
        : {
            tab,
            onTab: (t: "map" | "people") => go({ tab: t === "people" ? "people" : undefined }),
          })}
    >
      {tab === "map" && mapArea ? (
        <MapSearch
          mapArea={mapArea}
          maptilerKey={config?.maptilerKey ?? null}
          wards={wards}
          people={isAgent ? [] : (people?.rows ?? [])}
          onPick={(hit) => pick.current(hit)}
        />
      ) : null}
    </Bar>
  );
  const modals = (
    <>
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
    </>
  );

  if (tab === "people") {
    return (
      <section className="view active" aria-label="Voters">
        {modals}
        {bar}
        <div className="vt-actions vt-actions--page fx">
          <Link
            to="/broadcast"
            search={broadcastSearch(area, wards, search.support)}
            className="btn btn--primary btn--sm"
          >
            Message these people
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!canvass}
            onClick={() => exportPeople(canvass ?? null, area, wards, title)}
          >
            People list · CSV
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!people}
            onClick={() => setAdding(true)}
          >
            Add a person
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => go({ manage: true })}
          >
            Manage records
          </button>
        </div>
        <div className="vt-panel fx2">
          <PeopleView
            rows={rows}
            record={record}
            loading={!people}
            search={search}
            onSearch={go}
            placeName={title}
            segments={people?.segments ?? []}
          />
        </div>
      </section>
    );
  }

  const card =
    search.house && mapArea ? (
      <HouseCard
        pc={search.house}
        mapArea={mapArea}
        people={isAgent ? null : (people?.rows ?? [])}
        onClose={() => go({ house: undefined })}
        {...(isAgent ? {} : { onPerson: (id: string) => go({ tab: "people", person: id }) })}
      />
    ) : null;
  const panel = (
    <MapPanel
      area={area}
      wards={wards}
      canvass={canvass ?? null}
      doors={doors}
      houses={counts?.wards ?? {}}
      level={level}
      isAgent={isAgent}
      onArea={setArea}
      onSearch={go}
      card={card}
    />
  );
  return (
    <section className="view active" aria-label="Voters">
      {modals}
      <div className="vscreen">
        {bar}
        {mapArea ? (
          <MapScreen
            mapArea={mapArea}
            maptilerKey={config?.maptilerKey ?? null}
            wards={wards}
            area={area}
            search={search}
            doors={doors}
            counts={counts ?? null}
            level={level}
            onLevel={setLevel}
            onGo={go}
            onMapMove={(changes) =>
              void navigate({ search: (prev) => nextSearch(prev, changes), replace: true })
            }
            pick={pick}
            panel={panel}
          />
        ) : (
          <div className="vbody">
            <div className="vmap vmap--none">
              <p className="vmap-loading meta">
                {configFailed
                  ? "Could not load the map's settings. Try reloading."
                  : isAgent
                    ? "No map for this campaign yet: its area's houses aren't loaded."
                    : "No map for this campaign yet: its area's houses aren't loaded. The People tab works as before."}
              </p>
            </div>
            <Sheet label="This area">{panel}</Sheet>
          </div>
        )}
      </div>
    </section>
  );
}

/** The crumbs to the area on show, and the Map and People tabs. */
function Bar({
  title,
  crumbs,
  onArea,
  tab,
  onTab,
  children,
}: {
  title: string;
  crumbs: { label: string; area: Area }[];
  onArea: (a: Area) => void;
  /** Left out for agents, who get the map only. */
  tab?: "map" | "people";
  onTab?: (t: "map" | "people") => void;
  children?: ReactNode;
}) {
  return (
    <div className="vbar">
      <div className="vbar-place">
        {crumbs.length > 1 ? (
          <nav className="crumbs" aria-label="Area">
            {crumbs.slice(0, -1).map((c) => (
              <Fragment key={c.label}>
                <button type="button" onClick={() => onArea(c.area)}>
                  {c.label}
                </button>
                <span className="sep">/</span>
              </Fragment>
            ))}
          </nav>
        ) : null}
        <h1>{title}</h1>
      </div>
      <span className="spacer" />
      {children}
      {tab && onTab ? (
        <div className="seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={tab === "map"} onClick={() => onTab("map")}>
            Map
          </button>
          <button type="button" aria-pressed={tab === "people"} onClick={() => onTab("people")}>
            People
          </button>
        </div>
      ) : null}
    </div>
  );
}

const addressKey = (s: { area?: string; house?: string }) => `${s.area ?? ""}|${s.house ?? ""}`;

/** The map and its controls beside the panel. */
function MapScreen({
  mapArea,
  maptilerKey,
  wards,
  area,
  search,
  doors,
  counts,
  level,
  onLevel,
  onGo,
  onMapMove,
  pick,
  panel,
}: {
  mapArea: MapArea;
  maptilerKey: string | null;
  wards: WardInfo[];
  area: Area;
  search: VotersSearch;
  doors: WardDoors[] | null | undefined;
  counts: HouseCounts | null;
  level: Level;
  onLevel: (level: Level) => void;
  /** A change to the address, a step or not as stepFor says; a new area is flown to. */
  onGo: (changes: SearchChanges) => void;
  /** The person moved the map: the address follows, replacing the step. */
  onMapMove: (changes: SearchChanges) => void;
  /** Where the search box's picks go. */
  pick: RefObject<(hit: SearchHit) => void>;
  panel: ReactNode;
}) {
  const { campaign } = useAccess();
  const fetchHouses = useServerFn(getWardHouses);
  const fetchAtlas = useServerFn(getAtlas);
  const [tilesRefused, setTilesRefused] = useState(false);
  // The room the panel's sheet takes from the bottom of the map, on a narrow screen.
  const [room, setRoom] = useState(0);
  const colour: Colour = search.colour ?? "doors";
  const keyOk = Boolean(maptilerKey) && !tilesRefused;
  const base: Basemap = keyOk ? (search.base ?? "satellite") : "streets";

  const { data: geo, isError: geoFailed } = useQuery({
    queryKey: ["geo", mapArea.id, "wards"],
    queryFn: () => getJson<WardsGeo>(mapArea.wards),
    staleTime: Infinity,
  });
  const shapes = useMemo(() => (geo ? wardShapes(geo) : []), [geo]);
  const ward = area.level === "ward" ? (wards.find((w) => w.slug === area.slug) ?? null) : null;
  const { data: houses } = useQuery({
    queryKey: ["ward-houses", ward?.id],
    queryFn: () => fetchHouses({ data: { wardId: ward!.id } }),
    enabled: Boolean(ward) && colour !== "vote",
  });
  const { data: atlas } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    enabled: colour === "vote",
    staleTime: 5 * 60_000,
  });

  const wardFill = useMemo(() => {
    if (colour === "vote") {
      const race = defaultRace(campaign?.level);
      return Object.fromEntries(
        wards.map((w) => {
          const key = atlas ? wardKey(atlas, w.constituency, null) : null;
          const shade = atlas && key ? shadeOf(figuresFor(atlas, key, race, 2022), "lean") : null;
          return [w.slug, shade?.colour ?? NO_DATA];
        }),
      );
    }
    const byWard = new Map((doors ?? []).map((d) => [d.wardId, d]));
    return Object.fromEntries(
      wards.map((w) => [
        w.slug,
        doors ? wardShade(colour, counts?.wards[w.slug] ?? 0, byWard.get(w.id)) : NO_DATA,
      ]),
    );
  }, [colour, atlas, wards, doors, counts, campaign?.level]);
  const houseColours = useMemo(() => {
    const out = new Map<string, string>();
    for (const h of houses ?? []) {
      const c = houseColour(colour, h);
      if (c) out.set(h.pc, c);
    }
    return out;
  }, [houses, colour]);
  const legend: LegendItem[] =
    level === "street"
      ? houseLegend(colour)
      : colour === "vote"
        ? [...shadeLegend("lean"), { label: "Not found yet", colour: NO_DATA }]
        : doors === null
          ? [{ label: "Door counts not in yet", colour: NO_DATA }]
          : wardLegend(colour);

  // The camera follows the address: a new area, or a house opened from outside
  // the map, is flown to. What the map wrote itself (fromMap) isn't, and
  // closing a house leaves the camera where it is. A place from the search
  // leaves its own camera (pending) for the flight its new area starts.
  const key = addressKey(search);
  const fromMap = useRef<string | null>(null);
  const pending = useRef<CameraTarget | null>(null);
  const last = useRef<{ area: string | undefined; house: string | undefined } | null>(null);
  const [camera, setCamera] = useState<{ seq: number; target: CameraTarget } | null>(null);
  useEffect(() => {
    if (!geo) return;
    const prev = last.current;
    last.current = { area: search.area, house: search.house };
    const mine = fromMap.current === key;
    fromMap.current = null;
    if (mine) return;
    const areaChanged = !prev || prev.area !== search.area;
    const houseOpened = Boolean(search.house) && prev?.house !== search.house;
    if (!areaChanged && !houseOpened) return;
    const target =
      pending.current ?? cameraFor({ area, house: search.house ?? null }, wards, shapes, mapArea);
    pending.current = null;
    setCamera((c) => ({ seq: (c?.seq ?? 0) + 1, target }));
    // The camera follows the address and the ward shapes, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, geo]);

  // A search hit: its address, and for a place its own camera, flown even when the area stays.
  useEffect(() => {
    pick.current = (hit) => {
      const { changes, camera: target } = searchGo(hit, shapes);
      if (!target) onGo(changes);
      else if (addressKey(nextSearch(search, changes)) === key)
        setCamera((c) => ({ seq: (c?.seq ?? 0) + 1, target }));
      else {
        pending.current = target;
        onGo(changes);
      }
    };
  });

  /** A change the map made: kept from being flown, as a step or replacing it. */
  function fromTheMap(changes: SearchChanges, step: boolean) {
    const next = addressKey(nextSearch(search, changes));
    if (next === key) return;
    fromMap.current = next;
    if (step) onGo(changes);
    else onMapMove(changes);
  }

  return (
    <div className="vbody" style={{ "--vsheet": `${room}px` } as CSSProperties}>
      {geo ? (
        <VotersCanvas
          mapArea={mapArea}
          maptilerKey={keyOk ? maptilerKey : null}
          basemap={base}
          wards={geo}
          shapes={shapes}
          wardInfo={wards}
          area={area}
          wardFill={wardFill}
          houseColours={houseColours}
          house={search.house ?? null}
          camera={camera}
          padding={{ bottom: room }}
          onMoved={(a, at) =>
            fromTheMap(
              {
                ...(a ? { area: areaParam(a) } : {}),
                ...(at === "street" ? {} : { house: undefined }),
              },
              false,
            )
          }
          onPick={(a) => onGo({ area: areaParam(a), house: undefined })}
          onHouse={(pc) => {
            if (!pc) {
              fromTheMap({ house: undefined }, false);
              return;
            }
            // A house in the next ward makes that ward the one on show.
            const at = plusCodeCentre(pc);
            const shape = at ? wardAt(at, shapes) : null;
            fromTheMap({ house: pc, ...(shape ? { area: `w:${shape.slug}` } : {}) }, true);
          }}
          onLevel={onLevel}
          onTilesRefused={() => setTilesRefused(true)}
        >
          <div className="vtop">
            <div className="vtop-row">
              {keyOk ? (
                <div className="vglass vseg vseg--map" role="group" aria-label="Base map">
                  <button
                    type="button"
                    aria-pressed={base === "satellite"}
                    onClick={() => onGo({ base: undefined })}
                  >
                    Satellite
                  </button>
                  <button
                    type="button"
                    aria-pressed={base === "streets"}
                    onClick={() => onGo({ base: "streets" })}
                  >
                    Streets
                  </button>
                </div>
              ) : null}
              <div className="vglass vseg" role="group" aria-label="Colour by">
                {COLOURS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={colour === c.key}
                    onClick={() => onGo({ colour: c.key === "doors" ? undefined : c.key })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="vglass vhint" role="status">
                {hintFor(level, mapArea.top)}
              </div>
            </div>
            <div className="vglass vleg">
              {legend.length ? (
                legend.map((it) => (
                  <span key={it.label}>
                    <i style={{ background: it.colour }} />
                    {it.label}
                  </span>
                ))
              ) : (
                <span>Houses aren't shaded by the 2022 vote: zoom out to see the wards</span>
              )}
            </div>
          </div>
        </VotersCanvas>
      ) : (
        <div className="vmap">
          <p className="vmap-loading meta">
            {geoFailed ? "Could not load the ward boundaries. Try reloading." : "Loading the map…"}
          </p>
        </div>
      )}
      <Sheet
        label="This area"
        raiseOn={search.house ?? null}
        lowerOn={search.area ?? ""}
        onRoom={setRoom}
      >
        {panel}
        {tilesRefused ? (
          <p className="f-note">
            MapTiler turned the key down, so the map shows OpenFreeMap streets. Check the key and
            its allowed domains in MapTiler.
          </p>
        ) : null}
      </Sheet>
    </div>
  );
}
