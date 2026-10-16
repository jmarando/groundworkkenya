// A walk list's doors on a map, for the agent's phone: each house drawn from the list's own saved
// outline and coloured by what happened there, numbered in walking order, the next door ringed,
// and the phone's position. With signal it sits on the street map; with none (or when the street
// map doesn't arrive) it sits on a plain background, so a list opened once with signal still
// works in a dead zone. Loaded only when a list is first opened, so MapLibre isn't fetched before.

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which a bundle doesn't keep. Vite builds the
// worker as its own asset and this is its URL.
import maplibreWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import type { Fix } from "@/hooks/useDoorPlace";
import type { LngLat } from "@/lib/geo";
import { PLAIN_STYLE, styleUrl } from "@/lib/map-style";
import { boxOfDoors, type Shapes } from "@/lib/walk-list-map";

/** How long the street map has to arrive before the plain background takes over. */
const STREET_WAIT_MS = 6000;
const NO_DOOR = "__none__";
const EMPTY: Shapes = { type: "FeatureCollection", features: [] };

type Door = { pc: string; n: number; at: LngLat; done: boolean };

export function WalkListMap({
  shapes,
  doors,
  current,
  fix,
  online,
  maptilerKey,
  onPick,
}: {
  /** The doors' houses, coloured. */
  shapes: Shapes;
  /** The doors in walking order, each with whether anything has been recorded there. */
  doors: Door[];
  /** The next door, by its plus code: ringed, and the camera goes to it. */
  current: string | null;
  fix: Fix | null;
  online: boolean;
  maptilerKey: string | null;
  /** The agent tapped a door. */
  onPick: (pc: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const latest = useRef({ shapes, doors, current, onPick, online, maptilerKey });
  latest.current = { shapes, doors, current, onPick, online, maptilerKey };
  // Bumps after every style load, so the doors are drawn again on the new background.
  const [rev, setRev] = useState(0);
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLElement }>());
  const me = useRef<Marker | null>(null);

  useEffect(() => {
    let dead = false;
    let map: MlMap | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const held = markers.current;
    void import("maplibre-gl").then((ml) => {
      if (dead || !host.current) return;
      ml.setWorkerUrl(maplibreWorker);
      mlRef.current = ml;
      const p = latest.current;
      const box = boxOfDoors(p.doors);
      map = new ml.Map({
        container: host.current,
        style: p.online ? styleUrl("streets", p.maptilerKey) : PLAIN_STYLE,
        ...(box
          ? {
              bounds: [
                [box.west, box.south],
                [box.east, box.north],
              ] as [LngLat, LngLat],
              fitBoundsOptions: { padding: 36, maxZoom: 19 },
            }
          : { center: [36.8, -1.28] as LngLat, zoom: 15 }),
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        minZoom: 12,
        maxZoom: 20,
      });
      map.touchZoomRotate.disableRotation();
      const m = map;
      let styled = false;
      m.on("style.load", () => {
        styled = true;
        clearTimeout(timer);
        m.addSource("wl-doors", { type: "geojson", data: EMPTY });
        m.addLayer({
          id: "wl-doors-fill",
          type: "fill",
          source: "wl-doors",
          paint: { "fill-color": ["to-color", ["get", "colour"]], "fill-opacity": 0.9 },
        });
        m.addLayer({
          id: "wl-doors-line",
          type: "line",
          source: "wl-doors",
          paint: { "line-color": "hsl(262, 60%, 45%)", "line-width": 1.5 },
        });
        m.addLayer({
          id: "wl-current",
          type: "line",
          source: "wl-doors",
          filter: ["==", ["get", "pc"], NO_DOOR],
          paint: { "line-color": "hsl(15, 77%, 52%)", "line-width": 4 },
        });
        setRev((r) => r + 1);
      });
      // A street map that doesn't come (a weak signal, a refused key) gives way to the plain one.
      const plain = () => {
        if (!styled && !dead) m.setStyle(PLAIN_STYLE, { diff: false });
      };
      if (p.online) timer = setTimeout(plain, STREET_WAIT_MS);
      m.on("error", () => {
        if (!styled) plain();
      });
      mapRef.current = map;
    });
    return () => {
      dead = true;
      clearTimeout(timer);
      held.forEach((m) => m.marker.remove());
      held.clear();
      me.current?.remove();
      me.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // The street map comes and goes with the signal.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mapRef.current?.setStyle(online ? styleUrl("streets", maptilerKey) : PLAIN_STYLE, {
      diff: false,
    });
  }, [online, maptilerKey]);

  // The houses, coloured, and the ring round the next door.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rev) return;
    (map.getSource("wl-doors") as GeoJSONSource | undefined)?.setData(shapes as never);
    if (map.getLayer("wl-current"))
      map.setFilter("wl-current", ["==", ["get", "pc"], current ?? NO_DOOR]);
  }, [rev, shapes, current]);

  // The numbers: HTML markers, so no map font is needed, offline or on.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !rev) return;
    const have = markers.current;
    const want = new Set(doors.map((d) => d.pc));
    for (const [pc, m] of have)
      if (!want.has(pc)) {
        m.marker.remove();
        have.delete(pc);
      }
    for (const d of doors) {
      let m = have.get(d.pc);
      if (!m) {
        const el = document.createElement("button");
        el.type = "button";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          latest.current.onPick(d.pc);
        });
        m = {
          marker: new ml.Marker({ element: el, anchor: "center" }).setLngLat(d.at).addTo(map),
          el,
        };
        have.set(d.pc, m);
      }
      m.el.textContent = String(d.n);
      m.el.className = `wl-n${d.done ? " is-done" : ""}${d.pc === current ? " is-current" : ""}`;
      m.el.setAttribute("aria-label", `Door ${d.n}${d.done ? ", done" : ""}`);
    }
  }, [rev, doors, current]);

  // The next door comes to the middle, close enough to see the houses beside it.
  const lastCurrent = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const at = doors.find((d) => d.pc === current)?.at;
    if (!map || !rev || !at || lastCurrent.current === current) return;
    lastCurrent.current = current;
    map.easeTo({ center: at, zoom: Math.max(map.getZoom(), 17.5), duration: 500 });
  }, [rev, current, doors]);

  // Where the phone is.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !rev) return;
    if (!fix) {
      me.current?.remove();
      me.current = null;
      return;
    }
    if (me.current) me.current.setLngLat([fix.lng, fix.lat]);
    else {
      const el = document.createElement("div");
      el.className = "wl-me";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Where you are");
      me.current = new ml.Marker({ element: el }).setLngLat([fix.lng, fix.lat]).addTo(map);
    }
  }, [rev, fix]);

  return (
    <div
      ref={host}
      className="wl-map"
      aria-label="Map of the doors on this list, numbered in the order to walk them"
    />
  );
}
