import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { QueueProblems } from "@/components/gw/field/QueueProblems";
import { VisitSheet } from "@/components/gw/field/VisitSheet";
import { storage, type FieldQueue } from "@/hooks/useFieldQueue";
import type { Visit } from "@/lib/field";
import { getWalkList, type WalkEntry } from "@/lib/field.functions";
import { OUTCOME_LABEL } from "@/lib/houses";
import { mapAreaFor } from "@/lib/map-areas";
import { getMapConfig } from "@/lib/map.functions";

const WARD_KEY = "gw-field-ward";

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function FieldApp({
  wards,
  queue,
}: {
  wards: { id: string; slug: string; name: string; constituency: string }[];
  /** The page's queue of visits: shared with the walk lists above. */
  queue: FieldQueue;
}) {
  const fetchWalk = useServerFn(getWalkList);
  const [wardId, setWardId] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<{ person: WalkEntry | null } | null>(null);
  const { online, waiting, problems, syncing, sync, discard, retry } = queue;

  useEffect(() => {
    try {
      setWardId(storage()?.getItem(WARD_KEY) ?? "");
    } catch {
      // No remembered ward: the agent picks one.
    }
  }, []);

  const chooseWard = (id: string) => {
    setWardId(id);
    setSearch("");
    try {
      storage()?.setItem(WARD_KEY, id);
    } catch {
      // A remembered ward is a convenience; losing it costs one tap.
    }
  };

  const {
    data: list,
    isFetching,
    isError,
  } = useQuery<WalkEntry[]>({
    queryKey: ["walk-list", wardId],
    queryFn: () => fetchWalk({ data: { wardId } }),
    enabled: Boolean(wardId),
    staleTime: 60_000,
  });

  const ward = wards.find((w) => w.id === wardId);

  // The campaign's map area, whose house file places a visit at a house. Undefined until the
  // config arrives, which is not the same as null: a campaign with no map area.
  const fetchMapConfig = useServerFn(getMapConfig);
  const { data: mapConfig } = useQuery({
    queryKey: ["map-config"],
    queryFn: () => fetchMapConfig(),
    staleTime: Infinity,
  });
  const area = mapConfig ? mapAreaFor(mapConfig.mapArea) : undefined;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [list, search]);

  // A visit saved from the ward's list closes its sheet; one the server refused keeps it open.
  const save = async (visit: Visit): Promise<string | null> => {
    const reason = await queue.save(visit);
    if (reason === null) setOpen(null);
    return reason;
  };

  return (
    <div className="fa">
      <div className="fa-bar">
        <label className="fa-ward">
          <span className="eyebrow">Ward</span>
          <select value={wardId} onChange={(e) => chooseWard(e.target.value)}>
            <option value="">Choose your ward</option>
            {wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.constituency}
              </option>
            ))}
          </select>
        </label>
        <span className={`fa-net${online ? "" : " is-off"}`} role="status">
          {online ? "Online" : "No signal"}
          {waiting > 0 && ` · ${waiting} waiting`}
        </span>
      </div>

      {waiting > 0 && online && (
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          disabled={syncing}
          onClick={() => void sync()}
        >
          {syncing ? "Syncing…" : `Sync ${waiting} now`}
        </button>
      )}

      <QueueProblems problems={problems} onRetry={retry} onDiscard={discard} />

      {wardId ? (
        <>
          <div className="fa-tools">
            <input
              type="search"
              value={search}
              placeholder="Find a name"
              aria-label="Find a name on the walk list"
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => setOpen({ person: null })}
            >
              New person
            </button>
          </div>

          {isError && online && (
            <p className="f-note">
              Could not load the walk list. New people can still be signed up.
            </p>
          )}
          {!list && isFetching && <p className="f-note">Loading {ward?.name ?? "the ward"}…</p>}
          {!list && !online && (
            <p className="f-note">
              The list needs signal. You can still add someone you meet at the door.
            </p>
          )}
          {list && (
            <p className="f-note">
              {list.length} on the list · not reached yet first · anyone who refused in the last 30
              days is left off
            </p>
          )}

          <ul className="fa-list">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" className="fa-person" onClick={() => setOpen({ person: p })}>
                  <b>{p.name}</b>
                  <span className="mono">{p.phoneMasked}</span>
                  <small>
                    {p.lastOutcome
                      ? `${OUTCOME_LABEL[p.lastOutcome]} ${ago(p.lastVisitAt)}`
                      : p.lastContactedAt
                        ? `Last contact ${ago(p.lastContactedAt)}`
                        : "Not reached yet"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {list && shown.length === 0 && <p className="f-note">No one matches that name.</p>}
        </>
      ) : (
        <p className="f-note">Choose your ward to see who to visit.</p>
      )}

      {open && wardId && (
        <VisitSheet
          person={open.person}
          wardId={wardId}
          area={area}
          onSave={save}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
