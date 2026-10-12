import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { deleteNote, saveNote } from "@/lib/atlas.functions";
import type { AtlasNote } from "@/lib/atlas-view";

/** The team's note on a place: read by the team, written by the candidate or manager. */
export function NoteBox({
  area,
  name,
  note,
  canEdit,
}: {
  area: string;
  name: string;
  note: AtlasNote | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note?.body ?? "");
  const qc = useQueryClient();
  const save = useServerFn(saveNote);
  const remove = useServerFn(deleteNote);
  const done = async (message: string) => {
    await qc.invalidateQueries({ queryKey: ["atlas"] });
    setEditing(false);
    toast.success(message);
  };
  const saving = useMutation({
    mutationFn: () => save({ data: { area, body } }),
    onSuccess: () => done("Note saved."),
    onError: (e: Error) => toast.error(e.message),
  });
  const removing = useMutation({
    mutationFn: () => remove({ data: { area } }),
    onSuccess: () => {
      setBody("");
      return done("Note removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="card el-note">
      <div className="card-head">
        <h2>The team's note on {name}</h2>
      </div>
      {editing ? (
        <>
          <label className="sr" htmlFor="el-note-body">
            Note
          </label>
          <textarea
            id="el-note-body"
            rows={5}
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="f-note">
            Notes are about places: communities, languages used locally, churches, associations,
            local leaders. Never about a person's tribe.
          </p>
          <div className="mb-actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={saving.isPending || !body.trim()}
              onClick={() => saving.mutate()}
            >
              Save note
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setBody(note?.body ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : note ? (
        <>
          <p className="el-note-body">{note.body}</p>
          <p className="meta">
            Updated{" "}
            {new Date(note.updatedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          {canEdit ? (
            <div className="mb-actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setBody(note.body);
                  setEditing(true);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={removing.isPending}
                onClick={() => removing.mutate()}
              >
                Remove
              </button>
            </div>
          ) : null}
        </>
      ) : canEdit ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
          Add a note about this place
        </button>
      ) : (
        <p className="f-note">No note yet. The candidate or campaign manager can add one.</p>
      )}
    </section>
  );
}
