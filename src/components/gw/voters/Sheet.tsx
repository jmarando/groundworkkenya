// The Voters panel. Wider than 1,100 pixels it sits beside the map; narrower,
// it is a sheet over the bottom of the map that drags between three heights
// (peek, half and the map's full height) and snaps to the nearest when let
// go. Its handle is also a button that steps up through them. An opened house
// raises a peeking sheet to half; a new area lowers a full one, so the flight
// shows.

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { mapRoom, nearestSnap, nextSnap, snapHeight, type Snap } from "@/lib/sheet";

const NARROW = "(max-width: 1100px)";
const HANDLE: Record<Snap, string> = {
  peek: "Show more of the panel",
  half: "Show the whole panel",
  full: "Show the map",
};

/** Whether the screen is narrow enough for the sheet; false until mounted, as on the server. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function Sheet({
  label,
  raiseOn = null,
  lowerOn = null,
  onRoom,
  children,
}: {
  label: string;
  /** A new value here (an opened house) raises a peeking sheet to half. */
  raiseOn?: string | null;
  /** A new value here (a new area) lowers a full sheet to half. */
  lowerOn?: string | null;
  /** The room the sheet takes from the bottom of the map, for its padding; 0 when wide. */
  onRoom?: (px: number) => void;
  children: ReactNode;
}) {
  const narrow = useNarrow();
  const box = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState(0);
  const [snap, setSnap] = useState<Snap>("peek");
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  const dragged = useRef(false);

  // The map's height, which the three snaps are measured against.
  useEffect(() => {
    const parent = box.current?.parentElement;
    if (!narrow || !parent) return;
    const measure = () => setBody(parent.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [narrow]);

  useEffect(() => {
    if (raiseOn) setSnap((s) => (s === "peek" ? "half" : s));
  }, [raiseOn]);
  const lastLower = useRef(lowerOn);
  useEffect(() => {
    if (lastLower.current === lowerOn) return;
    lastLower.current = lowerOn;
    setSnap((s) => (s === "full" ? "half" : s));
  }, [lowerOn]);

  const room = narrow ? mapRoom(snap, body) : 0;
  useEffect(() => {
    onRoom?.(room);
  }, [room, onRoom]);

  if (!narrow)
    return (
      <aside className="vpanel" aria-label={label}>
        {children}
      </aside>
    );

  function down(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, h: snapHeight(snap, body) };
    dragged.current = false;
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    const dy = s.y - e.clientY;
    if (Math.abs(dy) > 4) dragged.current = true;
    if (dragged.current) setDrag(Math.min(Math.max(s.h + dy, snapHeight("peek", body)), body));
  }
  function up() {
    start.current = null;
    if (dragged.current && drag !== null) setSnap(nearestSnap(drag, body));
    setDrag(null);
  }

  return (
    <div
      ref={box}
      className={drag === null ? "vsheet" : "vsheet is-drag"}
      style={{ height: drag ?? snapHeight(snap, body) }}
    >
      <button
        type="button"
        className="vsheet-handle"
        aria-label={HANDLE[snap]}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={() => {
          // A drag ends in a click too; only a press steps.
          if (dragged.current) dragged.current = false;
          else setSnap(nextSnap(snap));
        }}
      >
        <span aria-hidden="true" />
      </button>
      <aside className="vpanel" aria-label={label}>
        {children}
      </aside>
    </div>
  );
}
