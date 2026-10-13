// The Voters map: one MapLibre map for every level, from the campaign's whole
// area down to a single house. Wards are shaded by the colour on show; from
// zoom 16 every house in the area is drawn from its house file (a tile at a
// time, through the "houses" protocol) and coloured by its latest visit. The
// level follows the zoom. When the person moves the map, the area on show
// follows its centre; when the app moves it (a link, a search, the fit
// button), it flies there and says nothing back. Draws only: the rules are in
// src/lib/voters-map.ts.

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GeoJSONSource, LngLatBoundsLike, Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which a bundle doesn't
// keep. Vite builds the worker as its own asset and this is its URL.
import maplibreWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { ringAreaM2, type Ring, type WardShape } from "@/lib/geo";
import { houseArchive } from "@/lib/house-source";
import { LAYER } from "@/lib/house-tiles";
import { MAP_AREAS, type MapArea } from "@/lib/map-areas";
import {
  areaAt,
  cameraFor,
  CONSTITUENCY_ZOOM,
  constituencyLabels,
  levelFor,
  MAX_ZOOM,
  MIN_ZOOM,
  STREET_ZOOM,
  type Basemap,
  type CameraTarget,
  type LabelPoints,
  type Level,
} from "@/lib/voters-map";
import type { Area } from "@/lib/voters-view";

export type WardsGeo = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { slug: string; name: string; constituency?: string };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }[];
};

type Props = {
  mapArea: MapArea;
  maptilerKey: string | null;
  basemap: Basemap;
  wards: WardsGeo;
  shapes: WardShape[];
  wardInfo: { slug: string; constituency: string }[];
  /** The area on show: its ward gets the accent line, and at street level the others are dimmed. */
  area: Area;
  /** A fill per ward slug, for the levels above the street. */
  wardFill: Record<string, string>;
  /** A fill per house plus code; houses not listed are drawn plain. */
  houseColours: Map<string, string>;
  /** The house whose card is open. */
  house: string | null;
  /** Where the app sends the camera; a new seq sends it again. */
  camera: { seq: number; target: CameraTarget } | null;
  /** Room the panel takes at the bottom (the sheet on phones), kept out of the map's centre. */
  padding: { bottom: number };
  /** The person moved the map: the area under its centre (null outside every ward), and the level. */
  onMoved: (area: Area | null, level: Level) => void;
  /** A click on a ward or a constituency's name, one level down. */
  onPick: (area: Area) => void;
  /** A click at street level: a house and its footprint in m², or null for none. */
  onHouse: (pc: string | null, footprintM2: number | null) => void;
  onLevel: (level: Level) => void;
  /** The basemap provider refused us (a bad or restricted key). */
  onTilesRefused: () => void;
  /** Controls, hint and legend drawn over the map. */
  children?: ReactNode;
};

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const OPENFREEMAP = "https://tiles.openfreemap.org/styles/liberty";
const NO_WARD = "__none__";

function styleUrl(basemap: Basemap, key: string | null): string {
  if (!key) return OPENFREEMAP;
  const k = encodeURIComponent(key);
  return basemap === "satellite"
    ? `https://api.maptiler.com/maps/hybrid/style.json?key=${k}`
    : `https://api.maptiler.com/maps/streets-v2/style.json?key=${k}`;
}

let housesProtocol = false;

/** houses://<area id>/{z}/{x}/{y}: a tile of the area's house file, read by range request. */
function addHousesProtocol(ml: typeof import("maplibre-gl")): void {
  if (housesProtocol) return;
  housesProtocol = true;
  ml.addProtocol("houses", async (params) => {
    const m = /^houses:\/\/([a-z0-9-]+)\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    const area = m ? MAP_AREAS.find((a) => a.id === m[1]) : undefined;
    if (!m || !area) return { data: new ArrayBuffer(0) };
    const archive = await houseArchive(area.houses);
    const bytes = await archive.getTile(Number(m[2]), Number(m[3]), Number(m[4]));
    return { data: bytes ? bytes.slice().buffer : new ArrayBuffer(0) };
  });
}

/** Our layers go on top of whichever basemap is showing; re-added after every style change. */
function addOverlays(map: MlMap, basemap: Basemap, mapArea: MapArea): void {
  const light = basemap === "streets";
  const ink = "hsl(158, 15%, 10%)";
  const quiet = light ? "hsla(158, 15%, 10%, 0.45)" : "hsla(0, 0%, 100%, 0.6)";
  const accent = "hsl(15, 77%, 52%)";
  const text = light ? ink : "hsl(0, 0%, 100%)";
  const halo = light ? "hsl(0, 0%, 100%)" : ink;

  // Our houses are the buildings: the basemap's own (OpenMapTiles' "building" layer) go.
  for (const l of map.getStyle().layers ?? [])
    if ((l as { "source-layer"?: string })["source-layer"] === "building")
      map.setLayoutProperty(l.id, "visibility", "none");

  map.addSource("gw-wards", {
    type: "geojson",
    data: EMPTY,
    promoteId: "slug",
    attribution: "Wards: geoBoundaries (CC BY 4.0)",
  });
  map.addSource("gw-houses", {
    type: "vector",
    tiles: [`houses://${mapArea.id}/{z}/{x}/{y}`],
    minzoom: STREET_ZOOM,
    maxzoom: STREET_ZOOM,
    bounds: mapArea.bounds,
    promoteId: "pc",
    attribution: "Houses: Google Open Buildings v3 (CC BY 4.0)",
  });
  map.addSource("gw-constituencies", { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "gw-wards-fill",
    type: "fill",
    source: "gw-wards",
    maxzoom: STREET_ZOOM,
    paint: {
      "fill-color": ["to-color", ["coalesce", ["feature-state", "fill"], "hsla(0, 0%, 0%, 0)"]],
      "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.3, 0.55],
    },
  });
  map.addLayer({
    id: "gw-houses-fill",
    type: "fill",
    source: "gw-houses",
    "source-layer": LAYER,
    minzoom: STREET_ZOOM,
    paint: {
      "fill-color": ["to-color", ["coalesce", ["feature-state", "col"], "hsl(0, 0%, 100%)"]],
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "has"], false],
        0.8,
        light ? 0.35 : 0.18,
      ],
    },
  });
  map.addLayer({
    id: "gw-houses-line",
    type: "line",
    source: "gw-houses",
    "source-layer": LAYER,
    minzoom: STREET_ZOOM + 0.5,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "focus"], false],
        accent,
        light ? "hsla(158, 15%, 10%, 0.55)" : "hsla(0, 0%, 100%, 0.7)",
      ],
      "line-width": ["case", ["boolean", ["feature-state", "focus"], false], 3, 0.7],
    },
  });
  // At street level, every ward but the one on show is dimmed.
  map.addLayer({
    id: "gw-wards-mask",
    type: "fill",
    source: "gw-wards",
    minzoom: STREET_ZOOM,
    filter: ["==", ["get", "slug"], NO_WARD],
    paint: { "fill-color": ink, "fill-opacity": 0.45 },
  });
  map.addLayer({
    id: "gw-wards-line",
    type: "line",
    source: "gw-wards",
    paint: {
      "line-color": ["case", ["boolean", ["feature-state", "sel"], false], accent, quiet],
      "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 3, 1],
    },
  });
  map.addLayer({
    id: "gw-wards-label",
    type: "symbol",
    source: "gw-wards",
    minzoom: mapArea.top === "county" ? CONSTITUENCY_ZOOM - 0.5 : 0,
    maxzoom: STREET_ZOOM,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-max-width": 8,
    },
    paint: { "text-color": text, "text-halo-color": halo, "text-halo-width": 1.2 },
  });
  if (mapArea.top === "county")
    map.addLayer({
      id: "gw-constituency-label",
      type: "symbol",
      source: "gw-constituencies",
      maxzoom: CONSTITUENCY_ZOOM,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 13,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.06,
        "text-max-width": 7,
      },
      paint: { "text-color": text, "text-halo-color": halo, "text-halo-width": 1.6 },
    });
}

function hasLayer(map: MlMap, id: string): boolean {
  try {
    return Boolean(map.getLayer(id));
  } catch {
    return false;
  }
}

/** A house's footprint from its drawn outline, in whole m². */
function footprint(f: MapGeoJSONFeature): number | null {
  const g = f.geometry;
  const polygons: Ring[][] =
    g.type === "Polygon"
      ? [g.coordinates as Ring[]]
      : g.type === "MultiPolygon"
        ? (g.coordinates as Ring[][])
        : [];
  const first = polygons[0];
  if (!first?.[0]) return null;
  const holes = first.slice(1).reduce((s, r) => s + ringAreaM2(r), 0);
  return Math.round(ringAreaM2(first[0]) - holes);
}

function withMargin([w, s, e, n]: [number, number, number, number]): LngLatBoundsLike {
  const dx = (e - w) * 0.25;
  const dy = (n - s) * 0.25;
  return [
    [w - dx, s - dy],
    [e + dx, n + dy],
  ];
}

/**
 * The app moves the camera: flown with the panel's room at the bottom as padding, and marked
 * so moveend doesn't report it as the person's move.
 */
function fly(map: MlMap, t: CameraTarget, bottom: number, duration = 800): void {
  const padding = { top: 0, right: 0, left: 0, bottom };
  if (t.kind === "point") {
    map.flyTo(
      { center: t.center, zoom: t.zoom, padding, duration, essential: true },
      { app: true },
    );
    return;
  }
  const c = map.cameraForBounds(
    [
      [t.box.west, t.box.south],
      [t.box.east, t.box.north],
    ],
    { padding: 32 },
  );
  if (!c?.center || c.zoom === undefined) return;
  const zoom = Math.min(Math.max(c.zoom, t.minZoom), t.maxZoom);
  map.flyTo({ center: c.center, zoom, padding, duration, essential: true }, { app: true });
}

/**
 * The panel's room at the bottom, as padding. setPadding jumps the camera, which would stop a
 * flight under way (it carries its own padding), so not while moving, and as the app's move.
 */
function applyPadding(map: MlMap, bottom: number): void {
  if (map.getPadding().bottom === bottom || map.isMoving()) return;
  map.setPadding({ top: 0, right: 0, left: 0, bottom }, { app: true });
}

export function VotersCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // loaded: the first style is up; styleRev bumps after every style load so
  // data and states are put back on the new basemap.
  const [loaded, setLoaded] = useState(false);
  const [styleRev, setStyleRev] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM);
  const labels: LabelPoints = useMemo(
    () => constituencyLabels(props.shapes, props.wardInfo),
    [props.shapes, props.wardInfo],
  );

  useEffect(() => {
    let dead = false;
    let map: MlMap | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !host.current) return;
      ml.setWorkerUrl(maplibreWorker);
      addHousesProtocol(ml);
      const p = latest.current;
      const start =
        p.camera?.target ?? cameraFor({ area: p.area }, p.wardInfo, p.shapes, p.mapArea);
      map = new ml.Map({
        container: host.current,
        style: styleUrl(p.basemap, p.maptilerKey),
        ...(start.kind === "point"
          ? { center: start.center, zoom: start.zoom }
          : {
              bounds: [
                [start.box.west, start.box.south],
                [start.box.east, start.box.north],
              ] as LngLatBoundsLike,
              fitBoundsOptions: { padding: 32, maxZoom: start.maxZoom },
            }),
        maxBounds: withMargin(p.mapArea.bounds),
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
      setZoomLevel(map.getZoom());
      map.on("style.load", () => {
        if (!map) return;
        addOverlays(map, latest.current.basemap, latest.current.mapArea);
        setStyleRev((r) => r + 1);
        setLoaded(true);
      });
      let level = levelFor(map.getZoom(), p.mapArea.top);
      p.onLevel(level);
      map.on("zoom", () => {
        if (!map) return;
        const z = map.getZoom();
        setZoomLevel(z);
        const next = levelFor(z, latest.current.mapArea.top);
        if (next !== level) {
          level = next;
          latest.current.onLevel(next);
        }
      });
      // A new size (the bar wrapping onto another line, a phone turned round)
      // ends with a moveend of its own, which isn't the person's move.
      let resized = false;
      map.on("resize", () => {
        resized = map ? !map.isMoving() : false;
      });
      map.on("moveend", (e) => {
        const sized = resized;
        resized = false;
        if (!map) return;
        // A room that changed while the camera moved goes in now.
        const m = map;
        requestAnimationFrame(() => applyPadding(m, latest.current.padding.bottom));
        if (sized || (e as { app?: boolean }).app) return;
        const q = latest.current;
        const at = levelFor(map.getZoom(), q.mapArea.top);
        const c = map.getCenter();
        q.onMoved(areaAt(at, [c.lng, c.lat], q.shapes, q.wardInfo, q.mapArea.top), at);
      });
      map.on("error", (e) => {
        const status = (e.error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) latest.current.onTilesRefused();
      });
      map.on("click", (e) => {
        if (!map) return;
        const q = latest.current;
        const at = levelFor(map.getZoom(), q.mapArea.top);
        if (at === "street") {
          const hit = hasLayer(map, "gw-houses-fill")
            ? map.queryRenderedFeatures(e.point, { layers: ["gw-houses-fill"] })[0]
            : undefined;
          const pc = hit ? String(hit.properties?.["pc"] ?? "") : "";
          q.onHouse(pc || null, hit && pc ? footprint(hit) : null);
          return;
        }
        if (at === "ward") {
          // The person's move: moveend says where it ended up.
          map.easeTo({ center: e.lngLat, zoom: STREET_ZOOM + 0.5, duration: 600 });
          return;
        }
        const label =
          at === "area" && hasLayer(map, "gw-constituency-label")
            ? map.queryRenderedFeatures(e.point, { layers: ["gw-constituency-label"] })[0]
            : undefined;
        const name = label ? String(label.properties?.["name"] ?? "") : "";
        if (name) {
          q.onPick({ level: "constituency", name });
          return;
        }
        const w = hasLayer(map, "gw-wards-fill")
          ? map.queryRenderedFeatures(e.point, { layers: ["gw-wards-fill"] })[0]
          : undefined;
        const slug = w ? String(w.properties?.["slug"] ?? "") : "";
        if (slug) q.onPick({ level: "ward", slug });
      });
      for (const layer of ["gw-houses-fill", "gw-wards-fill", "gw-constituency-label"]) {
        map.on("mouseenter", layer, () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          if (map) map.getCanvas().style.cursor = "";
        });
      }
      mapRef.current = map;
    });
    return () => {
      dead = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // A different basemap: reload the style in full (a diff would skip style.load);
  // our layers are added back on style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl(props.basemap, props.maptilerKey), { diff: false });
  }, [props.basemap, props.maptilerKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev) return;
    (map.getSource("gw-wards") as GeoJSONSource | undefined)?.setData(props.wards as never);
    (map.getSource("gw-constituencies") as GeoJSONSource | undefined)?.setData(labels as never);
  }, [styleRev, props.wards, labels]);

  const shownWard = props.area.level === "ward" ? props.area.slug : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev) return;
    for (const f of props.wards.features) {
      const slug = f.properties.slug;
      map.setFeatureState(
        { source: "gw-wards", id: slug },
        { fill: props.wardFill[slug] ?? "", sel: slug === shownWard },
      );
    }
    if (hasLayer(map, "gw-wards-mask"))
      map.setFilter("gw-wards-mask", ["!=", ["get", "slug"], shownWard ?? NO_WARD]);
  }, [styleRev, props.wards, props.wardFill, shownWard]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev || !map.getSource("gw-houses")) return;
    const source = { source: "gw-houses", sourceLayer: LAYER };
    map.removeFeatureState(source);
    for (const [id, col] of props.houseColours)
      map.setFeatureState({ ...source, id }, { col, has: true });
    if (props.house) map.setFeatureState({ ...source, id: props.house }, { focus: true });
  }, [styleRev, props.houseColours, props.house]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !props.camera) return;
    fly(map, props.camera.target, props.padding.bottom);
    // Only a new seq sends the camera again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, props.camera?.seq]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded) applyPadding(map, props.padding.bottom);
  }, [props.padding.bottom, loaded]);

  function zoom(by: number) {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, map.getZoom() + by)), duration: 240 });
  }

  function fit() {
    const map = mapRef.current;
    if (!map) return;
    fly(
      map,
      cameraFor({ area: props.area }, props.wardInfo, props.shapes, props.mapArea),
      props.padding.bottom,
      600,
    );
  }

  return (
    <div className="vmap">
      <div
        ref={host}
        className="vmap-canvas"
        aria-label={`Map of ${props.mapArea.name}: its wards, and every house from zoom 16`}
      />
      {!loaded && <div className="vmap-loading meta">Loading the map…</div>}
      {props.children}
      <div className="vglass vzoom" aria-label="Map zoom controls">
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={!loaded || zoomLevel >= MAX_ZOOM - 0.01}
          onClick={() => zoom(1)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={!loaded || zoomLevel <= MIN_ZOOM + 0.01}
          onClick={() => zoom(-1)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Show the whole area on show"
          title="Show the whole area on show"
          onClick={fit}
        >
          <span aria-hidden="true">⌖</span>
        </button>
      </div>
      {props.maptilerKey && (
        <a
          className="vlogo"
          href="https://www.maptiler.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://api.maptiler.com/resources/logo.svg"
            alt="MapTiler"
            width="67"
            height="20"
          />
        </a>
      )}
    </div>
  );
}
