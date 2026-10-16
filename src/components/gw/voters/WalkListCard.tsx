// An open walk list in the Voters panel: who has it and since when, how far along it is, how many
// doors were not home, and the two things an organiser does with it: give it to someone else, or
// close it. The map numbers its doors and colours them as visits come in.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { TeamPicker } from "@/components/gw/voters/TeamPicker";
import { holderText, progressText } from "@/lib/walk-lists";
import {
  closeWalkListNow,
  getListTeam,
  giveWalkListTo,
  type ListSummary,
} from "@/lib/walk-lists.functions";

export function WalkListCard({
  list,
  canManage,
  onClose,
}: {
  /** The list: undefined while the lists are read, null when it isn't open in this ward. */
  list: ListSummary | null | undefined;
  /** Whether the person may give and close lists. */
  canManage: boolean;
  /** Takes the card off the panel. */
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(getListTeam);
  const give = useServerFn(giveWalkListTo);
  const close = useServerFn(closeWalkListNow);
  const [giving, setGiving] = useState(false);
  const [to, setTo] = useState("");
  const { data: team } = useQuery({
    queryKey: ["walk-list-team"],
    queryFn: () => fetchTeam(),
    enabled: giving,
    staleTime: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["walk-lists"] });
  const giveTo = useMutation({
    mutationFn: () => give({ data: { id: list!.id, to } }),
    onSuccess: async () => {
      toast.success(`Walk list given to ${team?.find((m) => m.userId === to)?.name ?? "them"}.`);
      setGiving(false);
      setTo("");
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["walk-list-team"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const closeIt = useMutation({
    mutationFn: () => close({ data: { id: list!.id } }),
    onSuccess: async () => {
      toast.success("Walk list closed.");
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["walk-list-planning"] }),
        queryClient.invalidateQueries({ queryKey: ["walk-list-team"] }),
      ]);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!list) {
    return (
      <section className="vhouse" aria-label="Walk list">
        <div className="card-head">
          <div>
            <span className="eyebrow">Walk list</span>
            <h2>{list === undefined ? "Reading the walk list…" : "Not open any more"}</h2>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        {list === null ? (
          <p className="meta">
            This list isn't open in this ward. It may be done, or closed, or in another ward.
          </p>
        ) : null}
      </section>
    );
  }

  const pct = list.doors ? Math.min(100, Math.round((100 * list.done) / list.doors)) : 0;
  return (
    <section className="vhouse pw" aria-label={`Walk list ${list.name}`}>
      <div className="card-head">
        <div>
          <span className="eyebrow">Walk list{list.status === "draft" ? " · draft" : ""}</span>
          <h2>{list.name}</h2>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Close card
        </button>
      </div>
      <p className="meta">{holderText(list.givenToName, list.givenAt)}</p>
      <div
        className="pw-bar"
        role="progressbar"
        aria-label={progressText(list.done, list.doors)}
        aria-valuemin={0}
        aria-valuemax={list.doors}
        aria-valuenow={list.done}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="f-rows">
        <div className="f-row">
          <span>Doors done</span>
          <b>{progressText(list.done, list.doors)}</b>
        </div>
        <div className="f-row">
          <span>Not home</span>
          <b>{list.notHome}</b>
        </div>
      </div>

      {canManage ? (
        giving ? (
          <form
            className="pw-send"
            onSubmit={(e) => {
              e.preventDefault();
              giveTo.mutate();
            }}
          >
            <TeamPicker label="Give it to" value={to} onChange={setTo} team={team} />
            <div className="vhouse-actions">
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={!to || giveTo.isPending}
              >
                {giveTo.isPending ? "Giving…" : "Give it"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setGiving(false);
                  setTo("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="vhouse-actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setGiving(true)}
            >
              {list.status === "draft" ? "Give it to someone" : "Give to someone else"}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={closeIt.isPending}
              onClick={() => {
                if (window.confirm("Close this list? Doors not yet visited stay as they are."))
                  closeIt.mutate();
              }}
            >
              {closeIt.isPending ? "Closing…" : "Close"}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
}
