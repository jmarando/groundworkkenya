import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GeoJSONSource, LngLatBoundsLike, Map as MlMap } from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which a bundle doesn't
// keep. Vite builds the worker as its own asset and this is its URL.
import maplibreWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { inBox, type Box, type Building, type BuildingCollection } from "@/lib/geo";

export type Basemap = "satellite" | "streets";
export type Tool = "pan" | "select";

export type WardsGeo = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { slug: string; name: string; constituency: string };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  }[];
};

export type Pin = { id: string; lng: number; lat: number; colour: string };

type Props = {
  maptilerKey: string | null;
  basemap: Basemap;
  wards: WardsGeo;
  /** Share of each ward's win number already found, 0-1, by ward slug. */
  coverage: Record<string, number>;
  selectedWard: string | null;
  wardBox: Box | null;
  buildings: BuildingCollection | null;
  /** The same buildings with their centres, for selecting an area. */
  buildingList: Building[];
  /** Fill colour per building id for the current layer; buildings not listed are unknown. */
  colours: Map<string, string>;
  selection: Set<string>;
  focus: string | null;
  /** Households pinned by GPS alone, not yet tied to a building. */
  pins: Pin[];
  tool: Tool;
  onWard: (slug: string) => void;
  onBuilding: (id: string | null) => void;
  onToggle: (id: string) => void;
  onSelectBox: (ids: string[], add: boolean) => void;
  /** The basemap provider refused us (a bad or restricted key). */
  onTilesRefused: () => void;
  /** Controls and legend drawn over the map. */
  children?: ReactNode;
};

const NAIROBI: LngLatBoundsLike = [
  [36.66, -1.445],
  [37.105, -1.16],
];
const EMPTY = { type: "FeatureCollection" as const, features: [] };
const OPENFREEMAP = "https://tiles.openfreemap.org/styles/liberty";

function styleUrl(basemap: Basemap, key: string | null): string {
  if (!key) return OPENFREEMAP;
  const k = encodeURIComponent(key);
  return basemap === "satellite"
    ? `https://api.maptiler.com/maps/hybrid/style.json?key=${k}`
    : `https://api.maptiler.com/maps/streets-v2/style.json?key=${k}`;
}

/** Our layers go on top of whichever basemap is showing; re-added after every style change. */
function addOverlays(map: MlMap, basemap: Basemap): void {
  const light = basemap === "streets";
  const ink = "hsl(158, 15%, 10%)";
  const quiet = light ? "hsla(158, 15%, 10%, 0.45)" : "hsla(0, 0%, 100%, 0.6)";
  const accent = "hsl(15, 77%, 52%)";

  map.addSource("gw-wards", {
    type: "geojson",
    data: EMPTY,
    promoteId: "slug",
    attribution: "Wards: geoBoundaries (CC BY 4.0)",
  });
  map.addSource("gw-buildings", {
    type: "geojson",
    data: EMPTY,
    promoteId: "pc",
    attribution: "Buildings: Google Open Buildings (CC BY 4.0)",
  });
  map.addSource("gw-pins", { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "gw-wards-fill",
    type: "fill",
    source: "gw-wards",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["feature-state", "cov"], 0],
        0,
        "hsl(0, 72%, 52%)",
        0.5,
        "hsl(40, 92%, 52%)",
        1,
        "hsl(142, 62%, 40%)",
      ],
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "sel"], false],
        0,
        ["boolean", ["feature-state", "dim"], false],
        0.1,
        0.36,
      ],
    },
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
    id: "gw-buildings-fill",
    type: "fill",
    source: "gw-buildings",
    minzoom: 13,
    paint: {
      "fill-color": ["coalesce", ["feature-state", "col"], light ? ink : "hsl(0, 0%, 100%)"],
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "sel"], false],
        0.7,
        ["boolean", ["feature-state", "has"], false],
        0.55,
        0.08,
      ],
    },
  });
  map.addLayer({
    id: "gw-buildings-line",
    type: "line",
    source: "gw-buildings",
    minzoom: 14,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "sel"], false],
        accent,
        ["boolean", ["feature-state", "focus"], false],
        light ? ink : "hsl(0, 0%, 100%)",
        ["coalesce", ["feature-state", "col"], quiet],
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "focus"], false],
        3,
        ["boolean", ["feature-state", "sel"], false],
        2,
        0.7,
      ],
    },
  });
  map.addLayer({
    id: "gw-pins",
    type: "circle",
    source: "gw-pins",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 17, 7],
      "circle-color": ["get", "colour"],
      "circle-stroke-color": light ? ink : "hsl(0, 0%, 100%)",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "gw-wards-label",
    type: "symbol",
    source: "gw-wards",
    maxzoom: 13.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-max-width": 8,
    },
    paint: {
      "text-color": light ? ink : "hsl(0, 0%, 100%)",
      "text-halo-color": light ? "hsl(0, 0%, 100%)" : ink,
      "text-halo-width": 1.2,
    },
  });
}

function hasLayer(map: MlMap, id: string): boolean {
  try {
    return Boolean(map.getLayer(id));
  } catch {
    return false;
  }
}

export function WardMap(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // loaded: the first style is up (camera may move); styleRev: bumps after every
  // style load so data and states are put back on the new basemap.
  const [loaded, setLoaded] = useState(false);
  const [styleRev, setStyleRev] = useState(0);
  const [drag, setDrag] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    add: boolean;
  } | null>(null);

  useEffect(() => {
    let dead = false;
    let map: MlMap | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !host.current) return;
      ml.setWorkerUrl(maplibreWorker);
      map = new ml.Map({
        container: host.current,
        style: styleUrl(latest.current.basemap, latest.current.maptilerKey),
        bounds: NAIROBI,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        maxZoom: 20,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
      map.on("style.load", () => {
        if (!map) return;
        addOverlays(map, latest.current.basemap);
        setStyleRev((r) => r + 1);
        setLoaded(true);
      });
      map.on("error", (e) => {
        const status = (e.error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) latest.current.onTilesRefused();
      });
      map.on("click", (e) => {
        if (!map) return;
        const p = latest.current;
        const b = hasLayer(map, "gw-buildings-fill")
          ? map.queryRenderedFeatures(e.point, { layers: ["gw-buildings-fill"] })[0]
          : undefined;
        if (b) {
          const id = String(b.properties?.["pc"] ?? "");
          if (!id) return;
          if (p.tool === "select") p.onToggle(id);
          else p.onBuilding(id);
          return;
        }
        const w = hasLayer(map, "gw-wards-fill")
          ? map.queryRenderedFeatures(e.point, { layers: ["gw-wards-fill"] })[0]
          : undefined;
        const slug = w ? String(w.properties?.["slug"] ?? "") : "";
        if (slug && slug !== p.selectedWard) p.onWard(slug);
        else p.onBuilding(null);
      });
      for (const layer of ["gw-buildings-fill", "gw-wards-fill"]) {
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

  // A different basemap: reload the style in full (a diff would skip style.load),
  // and our layers are added back on style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl(props.basemap, props.maptilerKey), { diff: false });
  }, [props.basemap, props.maptilerKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev) return;
    (map.getSource("gw-wards") as GeoJSONSource | undefined)?.setData(props.wards as never);
  }, [styleRev, props.wards]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev) return;
    for (const f of props.wards.features) {
      const slug = f.properties.slug;
      map.setFeatureState(
        { source: "gw-wards", id: slug },
        {
          cov: props.coverage[slug] ?? 0,
          sel: slug === props.selectedWard,
          dim: Boolean(props.selectedWard) && slug !== props.selectedWard,
        },
      );
    }
  }, [styleRev, props.wards, props.coverage, props.selectedWard]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev) return;
    (map.getSource("gw-buildings") as GeoJSONSource | undefined)?.setData(
      (props.buildings ?? EMPTY) as never,
    );
  }, [styleRev, props.buildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev || !map.getSource("gw-buildings")) return;
    map.removeFeatureState({ source: "gw-buildings" });
    for (const [id, col] of props.colours) {
      map.setFeatureState({ source: "gw-buildings", id }, { col, has: true });
    }
    for (const id of props.selection)
      map.setFeatureState({ source: "gw-buildings", id }, { sel: true });
    if (props.focus)
      map.setFeatureState({ source: "gw-buildings", id: props.focus }, { focus: true });
  }, [styleRev, props.buildings, props.colours, props.selection, props.focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleRev) return;
    (map.getSource("gw-pins") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: props.pins.map((p) => ({
        type: "Feature",
        properties: { colour: p.colour, id: p.id },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    } as never);
  }, [styleRev, props.pins]);

  // Fly to the ward that was picked, or back out to the county.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const b = props.wardBox;
    if (b) {
      map.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: 36, maxZoom: 16.5, duration: 700 },
      );
    } else {
      map.fitBounds(NAIROBI, { padding: 24, duration: 700 });
    }
  }, [loaded, props.selectedWard, props.wardBox]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.tool === "select") map.dragPan.disable();
    else map.dragPan.enable();
  }, [props.tool, loaded]);

  function zoom(by: number) {
    const map = mapRef.current;
    if (!map) return;
    if (by > 0) map.zoomIn();
    else map.zoomOut();
  }

  function fit() {
    const map = mapRef.current;
    if (!map) return;
    const b = props.wardBox;
    if (b) {
      map.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: 36, maxZoom: 16.5 },
      );
    } else {
      map.fitBounds(NAIROBI, { padding: 24 });
    }
  }

  // Select area: drag a box over the map; a tap toggles one building.
  function local(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function boxDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey });
  }
  function boxMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const p = local(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  }
  function boxUp() {
    const map = mapRef.current;
    const d = drag;
    setDrag(null);
    if (!map || !d) return;
    if (Math.abs(d.x1 - d.x0) < 6 && Math.abs(d.y1 - d.y0) < 6) {
      if (!hasLayer(map, "gw-buildings-fill")) return;
      const hit = map.queryRenderedFeatures([d.x0, d.y0], { layers: ["gw-buildings-fill"] })[0];
      const id = hit ? String(hit.properties?.["pc"] ?? "") : "";
      if (id) props.onToggle(id);
      return;
    }
    const a = map.unproject([Math.min(d.x0, d.x1), Math.max(d.y0, d.y1)]);
    const b = map.unproject([Math.max(d.x0, d.x1), Math.min(d.y0, d.y1)]);
    const box: Box = { west: a.lng, south: a.lat, east: b.lng, north: b.lat };
    props.onSelectBox(
      props.buildingList.filter((x) => inBox(x.centre, box)).map((x) => x.id),
      d.add,
    );
  }

  return (
    <div className={`vmap${props.tool === "select" ? " is-select" : ""}`}>
      <div ref={host} className="vmap-canvas" aria-label="Map of Nairobi's wards and buildings" />
      {props.tool === "select" && (
        <div
          className="vmap-select"
          onPointerDown={boxDown}
          onPointerMove={boxMove}
          onPointerUp={boxUp}
          onPointerCancel={() => setDrag(null)}
        >
          {drag && (
            <span
              className="vmap-selbox"
              style={{
                left: Math.min(drag.x0, drag.x1),
                top: Math.min(drag.y0, drag.y1),
                width: Math.abs(drag.x1 - drag.x0),
                height: Math.abs(drag.y1 - drag.y0),
              }}
            />
          )}
        </div>
      )}
      {!loaded && <div className="vmap-loading meta">Loading the map…</div>}
      {props.children}
      <div className="vglass vzoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(-1)}>
          −
        </button>
        <button
          type="button"
          aria-label={props.wardBox ? "Fit the ward" : "Fit the county"}
          style={{ fontSize: 12 }}
          onClick={fit}
        >
          ⤢
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
