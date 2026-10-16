// A walk list as the agent walks it: its name and how far along it is, the map of its doors, and
// this door with its visit. The next door is the first not done after this one in walking order;
// a door skipped comes back at the end. Visits go through the page's queue, so they are kept on
// the phone with no signal and counted toward the list's progress at once. A list opened once
// with signal is kept on the phone, and opens with none.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";

import { DoorVisit } from "@/components/gw/field/VisitSheet";
import { QueueProblems } from "@/components/gw/field/QueueProblems";
import { useFix } from "@/hooks/useDoorPlace";
import type { FieldQueue } from "@/hooks/useFieldQueue";
import { useListDoors, useMyWalkLists } from "@/hooks/useMyWalkLists";
import type { Visit } from "@/lib/field";
import { blockNote, type Outcome } from "@/lib/houses";
import { getMapConfig } from "@/lib/map.functions";
import { outcomeShapes } from "@/lib/walk-list-map";
import { doorOutcomes, footprintM2, queueNote, runProgress } from "@/lib/walk-list-run";
import { nextDoor, progressText } from "@/lib/walk-lists";

// MapLibre is fetched when a list is first opened, not with the field page.
const WalkListMap = lazy(() =>
  import("@/components/gw/field/WalkListMap").then((m) => ({ default: m.WalkListMap })),
);

/** The map's code not arriving (no signal, never opened with it): the doors below still work. */
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p className="f-note">
        The map isn't on this phone yet. Open this list once with signal to keep it; the doors are
        below.
      </p>
    ) : (
      this.props.children
    );
  }
}

export function WalkListRun({
  listId,
  queue,
  onBack,
}: {
  listId: string;
  queue: FieldQueue;
  /** Back to "Your walk lists". */
  onBack: () => void;
}) {
  const { online } = queue;
  const { data: lists } = useMyWalkLists(online);
  const { data: opened, isError } = useListDoors(listId, online);
  const fetchConfig = useServerFn(getMapConfig);
  const { data: config } = useQuery({
    queryKey: ["map-config"],
    queryFn: () => fetchConfig(),
    staleTime: Infinity,
  });
  const geo = useFix();

  // Where the agent is in the list: the door chosen (none yet: the first one not done), the doors
  // skipped, and the visits saved this minute that the server hasn't been read for yet.
  const [chosen, setChosen] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [saved, setSaved] = useState<ReadonlyMap<string, Outcome>>(new Map());

  const list = lists?.find((l) => l.id === listId) ?? null;
  const doors = useMemo(() => [...(opened?.doors ?? [])].sort((a, b) => a.n - b.n), [opened]);
  const order = useMemo(() => doors.map((d) => d.pc), [doors]);
  const outcomes = useMemo(
    () => doorOutcomes(doors, list?.firstSentAt ?? null, queue.queue, listId, saved),
    [doors, list?.firstSentAt, queue.queue, listId, saved],
  );
  const visited = useMemo(() => new Set(outcomes.keys()), [outcomes]);
  const shapes = useMemo(() => outcomeShapes(doors, outcomes), [doors, outcomes]);
  // Not rebuilt when only the phone's position moves, which is every few seconds.
  const mapDoors = useMemo(
    () => doors.map((d) => ({ pc: d.pc, n: d.n, at: d.at, done: visited.has(d.pc) })),
    [doors, visited],
  );

  const back = (
    <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
      ← Your walk lists
    </button>
  );

  if (!opened)
    return (
      <div className="wl-run">
        {back}
        <p className="f-note">
          {!online || isError ? "This list needs signal once to open." : "Opening the list…"}
        </p>
      </div>
    );
  if (lists && !list)
    return (
      <div className="wl-run">
        {back}
        <p className="f-note">
          This list isn't with you any more: it is done, or it was given to someone else.
        </p>
      </div>
    );
  if (!list)
    return (
      <div className="wl-run">
        {back}
        <p className="f-note">Opening the list…</p>
      </div>
    );

  const target = chosen ?? nextDoor(order, visited, skipped, null);
  const door = doors.find((d) => d.pc === target) ?? null;
  const { done, total } = runProgress(outcomes, doors.length);
  const note = queueNote(queue.waiting, online);
  const leftOver = order.filter((pc) => !visited.has(pc)).length;

  /** The door after this one if it were done: for the save button, and where it goes. */
  const after = (pc: string, extra: ReadonlySet<string>) =>
    nextDoor(order, new Set([...visited, ...extra]), skipped, pc);
  const nextOf = door ? after(door.pc, new Set([door.pc])) : null;

  const save = async (visit: Visit): Promise<string | null> => {
    const reason = await queue.save(visit);
    if (reason === null && visit.doorPc) {
      setSaved((m) => new Map(m).set(visit.doorPc!, visit.outcome));
      setChosen(after(visit.doorPc, new Set([visit.doorPc])));
    }
    return reason;
  };
  const skip = () => {
    if (!door) return;
    const next = [...skipped.filter((pc) => pc !== door.pc), door.pc];
    setSkipped(next);
    setChosen(nextDoor(order, visited, next, door.pc));
  };
  const pick = (pc: string) => {
    setChosen(pc);
    setSkipped((s) => s.filter((x) => x !== pc));
  };

  return (
    <div className="wl-run">
      <div className="wl-head">
        {back}
        <h3>{list.name}</h3>
        <p className="meta">
          {progressText(done, total)}
          {list.centreName ? ` · ${list.centreName}` : ""}
        </p>
        <div
          className="wl-bar"
          role="progressbar"
          aria-label={progressText(done, total)}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <i style={{ width: `${total ? Math.round((100 * done) / total) : 0}%` }} />
        </div>
        {note ? (
          <p className={`wl-note${online ? "" : " is-off"}`} role="status">
            {note}
          </p>
        ) : null}
      </div>

      <QueueProblems
        problems={queue.problems.filter((p) => p.walkListId === listId)}
        onRetry={queue.retry}
        onDiscard={queue.discard}
      />

      <MapBoundary>
        <Suspense fallback={<div className="wl-map wl-map--loading">Loading the map…</div>}>
          <WalkListMap
            shapes={shapes}
            doors={mapDoors}
            current={door?.pc ?? null}
            fix={geo.fix}
            online={online}
            maptilerKey={config?.maptilerKey ?? null}
            onPick={pick}
          />
        </Suspense>
      </MapBoundary>

      {door ? (
        <DoorVisit
          key={door.pc}
          list={list}
          door={door}
          total={doors.length}
          people={(opened.people ?? []).filter((p) => p.pc === door.pc)}
          footprintNote={blockNote(footprintM2(door.rings))}
          nextN={nextOf ? (doors.find((d) => d.pc === nextOf)?.n ?? null) : null}
          fix={geo.fix}
          onSave={save}
          onSkip={skip}
        />
      ) : (
        <p className="f-note">
          {leftOver > 0
            ? "Only doors you skipped are left: tap one on the map to go back to it."
            : "Every door on this list has a visit. Well done."}
        </p>
      )}
    </div>
  );
}
