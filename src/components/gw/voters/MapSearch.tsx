// The one search box above the Voters map: wards and constituencies by name,
// polling centres by name or code, people on file by name or number, and places
// and streets from MapTiler when the key is set. A combobox: the arrow keys move
// through the results, Enter picks one, Escape closes them.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { Centre } from "@/lib/centres";
import type { MapArea } from "@/lib/map-areas";
import { geocodeUrl, placeHits, searchHits, type SearchHit } from "@/lib/voters-map";

const GROUPS: { kind: SearchHit["kind"]; label: string }[] = [
  { kind: "ward", label: "Wards" },
  { kind: "constituency", label: "Constituencies" },
  { kind: "centre", label: "Polling centres" },
  { kind: "person", label: "People" },
  { kind: "place", label: "Places" },
];

export function MapSearch({
  mapArea,
  maptilerKey,
  wards,
  centres,
  people,
  onPick,
}: {
  mapArea: MapArea;
  /** Places and streets come from MapTiler's search with the map's key; none without it. */
  maptilerKey: string | null;
  wards: { id: string; slug: string; name: string; constituency: string }[];
  /** The campaign's polling centres, placed or not; none while they are read. */
  centres: Centre[];
  /** People on file; none for agents, who don't search the records. */
  people: { id: string; name: string; phone: string; ward: string | null; house: string | null }[];
  onPick: (hit: SearchHit) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Places are looked up once typing pauses.
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSettled(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const url = geocodeUrl(settled, maptilerKey, mapArea.bounds);
  const { data: places = [], isFetching } = useQuery({
    queryKey: ["geocode", url],
    queryFn: async () => {
      const res = await fetch(url!);
      return res.ok ? placeHits(await res.json()) : [];
    },
    enabled: Boolean(url),
    staleTime: 5 * 60_000,
  });
  const hits = useMemo(
    () =>
      q.trim()
        ? [...searchHits(q, wards, people, mapArea.top, centres), ...(settled === q ? places : [])]
        : [],
    [q, settled, wards, people, centres, mapArea.top, places],
  );
  const shown = open && hits.length > 0;
  const nothing = open && q.trim().length >= 2 && !hits.length && settled === q && !isFetching;

  function pick(hit: SearchHit) {
    onPick(hit);
    setQ("");
    setOpen(false);
    input.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const n = hits.length;
      if (n) setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter") {
      const hit = hits[active];
      if (shown && hit) {
        e.preventDefault();
        pick(hit);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="vsearch">
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search wards, polling centres, people and places"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        {...(shown && hits[active] ? { "aria-activedescendant": `${id}-${active}` } : {})}
        placeholder={
          maptilerKey ? "Search wards, centres, people, places" : "Search wards, centres, people"
        }
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {shown ? (
        <ul id={`${id}-list`} role="listbox" className="vsearch-list" aria-label="Results">
          {GROUPS.map((g) => {
            const inGroup = hits.flatMap((h, i) => (h.kind === g.kind ? [{ h, i }] : []));
            if (!inGroup.length) return null;
            return [
              <li key={g.kind} role="presentation" className="vsearch-group">
                {g.label}
              </li>,
              ...inGroup.map(({ h, i }) => (
                <li
                  key={`${g.kind}-${i}`}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="vsearch-opt"
                  // Keep the focus in the box, so the pick lands before it closes.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(h)}
                >
                  <span>{h.label}</span>
                  <small>{h.sub}</small>
                </li>
              )),
            ];
          })}
        </ul>
      ) : nothing ? (
        <p className="vsearch-list vsearch-none" role="status">
          Nothing by that name in this area.
        </p>
      ) : null}
    </div>
  );
}
