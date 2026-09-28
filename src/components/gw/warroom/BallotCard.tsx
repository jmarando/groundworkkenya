import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { WarRoomData } from "@/lib/console.functions";
import { saveBallot, type BallotEntry } from "@/lib/election.functions";

/** The ballot agents key votes in, in the order printed on the form. */
export function BallotCard({
  ballot,
  locked,
  canEdit,
}: {
  ballot: WarRoomData["ballot"];
  locked: boolean;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Ballot</h2>
        <span className="mono">
          {locked ? "order locked · forms filed" : "agents key votes in this order"}
        </span>
      </div>
      {ballot.length === 0 ? (
        <p className="meta">
          No candidates yet. Agents cannot file a Form 34A until the ballot is set, in the order
          printed on the form.
        </p>
      ) : (
        <ol className="ballot-list">
          {ballot.map((c) => (
            <li key={c.id}>
              <b>{c.name}</b>
              {c.party ? <span className="meta"> · {c.party}</span> : null}
              {c.ours ? <span className="meta"> · our candidate</span> : null}
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
          {ballot.length ? "Edit ballot" : "Set the ballot"}
        </button>
      )}
      {/* Outside the war room's dark surface, so the form reads like every other one. */}
      {editing &&
        createPortal(
          <BallotEditor ballot={ballot} locked={locked} onClose={() => setEditing(false)} />,
          document.body,
        )}
    </div>
  );
}

function BallotEditor({
  ballot,
  locked,
  onClose,
}: {
  ballot: WarRoomData["ballot"];
  locked: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<BallotEntry[]>(() =>
    ballot.length
      ? ballot.map((b) => ({ id: b.id, name: b.name, party: b.party, ours: b.ours }))
      : [{ name: "", party: null, ours: true }],
  );
  const save = useServerFn(saveBallot);
  const queryClient = useQueryClient();

  const problem = rows.some((r) => !r.name.trim())
    ? "Every candidate needs a name."
    : new Set(rows.map((r) => r.name.trim().toLowerCase())).size < rows.length
      ? "Two candidates have the same name."
      : null;

  const mutation = useMutation({
    mutationFn: () => save({ data: { candidates: rows } }),
    onSuccess: async () => {
      toast.success("Ballot saved.");
      await queryClient.invalidateQueries({ queryKey: ["warroom"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (i: number, patch: Partial<BallotEntry>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row!);
      return next;
    });

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="ballot-title">
      <form
        className="pb"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) mutation.mutate();
        }}
      >
        <div className="pb-head">
          <div>
            <span className="eyebrow">War room · ballot</span>
            <h2 id="ballot-title">In the order printed on the form.</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pb-body">
          {locked && (
            <p className="meta">
              Forms are already filed against this order, so candidates can be renamed but not
              added, removed or moved.
            </p>
          )}
          {rows.map((r, i) => (
            <div className="pb-row pb-row--ballot" key={r.id ?? `new-${i}`}>
              <span className="mono ballot-pos" aria-hidden="true">
                {i + 1}
              </span>
              <label className="pb-field">
                <span>Candidate {i + 1}</span>
                <input
                  value={r.name}
                  maxLength={60}
                  autoComplete="off"
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </label>
              <label className="pb-field">
                <span>Party</span>
                <input
                  value={r.party ?? ""}
                  maxLength={30}
                  autoComplete="off"
                  onChange={(e) => update(i, { party: e.target.value || null })}
                />
              </label>
              <label className="pb-check">
                <input
                  type="checkbox"
                  checked={r.ours}
                  onChange={(e) => update(i, { ours: e.target.checked })}
                />{" "}
                Ours
              </label>
              {!locked && (
                <span className="ballot-moves">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move candidate ${i + 1} up`}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move candidate ${i + 1} down`}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                    aria-label={`Remove candidate ${i + 1}`}
                  >
                    Remove
                  </button>
                </span>
              )}
            </div>
          ))}
          {!locked && rows.length < 30 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setRows((rs) => [...rs, { name: "", party: null, ours: false }])}
            >
              Add candidate
            </button>
          )}
        </div>

        <div className="pb-foot">
          <p className="f-note" aria-live="polite">
            {problem ?? `${rows.length} candidate${rows.length === 1 ? "" : "s"}.`}
          </p>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={Boolean(problem) || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save ballot"}
          </button>
        </div>
      </form>
    </div>
  );
}
