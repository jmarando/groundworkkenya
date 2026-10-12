import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAccess } from "@/hooks/useAccess";
import { briefLine, wardKey } from "@/lib/atlas-app";
import { getAtlas } from "@/lib/atlas.functions";

import {
  cleanEntry,
  dayName,
  DIARY_KINDS,
  KIND_NAMES,
  timeName,
  type DiaryEntry,
} from "@/lib/diary";
import { removeDiaryEntry, saveDiaryEntry, type DiaryWeek as Week } from "@/lib/diary.functions";
import { defaultRace } from "@/lib/elections-view";

type Ward = Week["wards"][number];

/** The diary and Home both show entries; read them again after a change. */
function useRefresh() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ["diary"] });
    await queryClient.invalidateQueries({ queryKey: ["home"] });
  };
}

/** Each stop in a ward, with a line from the last election there (the atlas). */
function useBriefs(week: Week): Record<string, string> {
  const { campaign } = useAccess();
  const fetchAtlas = useServerFn(getAtlas);
  const { data: atlas } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    if (!atlas) return {};
    const race = defaultRace(campaign?.level);
    const out: Record<string, string> = {};
    for (const e of week.entries) {
      const w = e.wardId ? week.wards.find((x) => x.id === e.wardId) : undefined;
      const line = w ? briefLine(atlas, wardKey(atlas, w.constituency, w.slug), race) : null;
      if (line) out[e.id] = line;
    }
    return out;
  }, [atlas, week, campaign?.level]);
}

/** A week of the diary, Monday to Sunday, each day with its entries by time. */
export function DiaryWeek({ week, canEdit }: { week: Week; canEdit: boolean }) {
  const briefs = useBriefs(week);
  return (
    <div className="diary-days">
      {week.days.map((day) => (
        <DiaryDay
          key={day}
          day={day}
          isToday={day === week.today}
          entries={week.entries.filter((e) => e.day === day)}
          wards={week.wards}
          briefs={briefs}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

function DiaryDay({
  day,
  isToday,
  entries,
  wards,
  briefs,
  canEdit,
}: {
  day: string;
  isToday: boolean;
  entries: DiaryEntry[];
  wards: Ward[];
  /** A line from the last election, by entry id, for stops in a ward. */
  briefs: Record<string, string>;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section
      className={`card diary-day${isToday ? " is-today" : ""}`}
      aria-labelledby={`dd-${day}`}
    >
      <div className="card-head">
        <h2 id={`dd-${day}`}>
          {dayName(day)}
          {isToday ? <span className="diary-today"> · Today</span> : null}
        </h2>
        {canEdit && !adding ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
            Add
          </button>
        ) : null}
      </div>
      {entries.length ? (
        <ol className="mb-time">
          {entries.map((e) =>
            editing === e.id ? (
              <li key={e.id} className="diary-editing">
                <EntryForm day={day} entry={e} wards={wards} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={e.id}>
                <span className="mb-time-at">{timeName(e)}</span>
                <div>
                  <p className="mb-time-place">
                    {e.title}{" "}
                    <span className="mb-kind">
                      {KIND_NAMES[e.kind]}
                      {e.wardName ? ` · ${e.wardName}` : ""}
                    </span>
                  </p>
                  {briefs[e.id] ? (
                    <p className="diary-brief" title="The last election here, from the atlas">
                      {briefs[e.id]}
                    </p>
                  ) : null}
                  {e.note ? <p className="mb-time-why">{e.note}</p> : null}
                  {canEdit ? (
                    <div className="diary-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setEditing(e.id)}
                      >
                        Edit
                      </button>
                      <RemoveEntry entry={e} />
                    </div>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ol>
      ) : !adding ? (
        <p className="meta">Nothing planned.</p>
      ) : null}
      {adding ? (
        <EntryForm day={day} entry={null} wards={wards} onDone={() => setAdding(false)} />
      ) : null}
    </section>
  );
}

function RemoveEntry({ entry }: { entry: DiaryEntry }) {
  const [sure, setSure] = useState(false);
  const remove = useServerFn(removeDiaryEntry);
  const refresh = useRefresh();
  const removing = useMutation({
    mutationFn: () => remove({ data: { id: entry.id } }),
    onSuccess: async () => {
      toast.success("Removed from the diary.");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm home-remove${sure ? " is-sure" : ""}`}
      onClick={() => (sure ? removing.mutate() : setSure(true))}
      onBlur={() => setSure(false)}
      disabled={removing.isPending}
    >
      {sure ? `Remove ${entry.title}?` : "Remove"}
    </button>
  );
}

function EntryForm({
  day,
  entry,
  wards,
  onDone,
}: {
  day: string;
  entry: DiaryEntry | null;
  wards: Ward[];
  onDone: () => void;
}) {
  const [startsAt, setStartsAt] = useState(entry?.startsAt ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [kind, setKind] = useState<string>(entry?.kind ?? "visit");
  const [wardId, setWardId] = useState(entry?.wardId ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const save = useServerFn(saveDiaryEntry);
  const refresh = useRefresh();

  const input = { id: entry?.id ?? null, day, startsAt, title, kind, wardId, note };
  // The server checks again; this only says what is missing before it is sent.
  let problem: string | null = null;
  try {
    cleanEntry(input);
  } catch (e) {
    problem = (e as Error).message;
  }
  const saving = useMutation({
    mutationFn: () => save({ data: input }),
    onSuccess: async () => {
      toast.success(entry ? "Diary updated." : "Added to the diary.");
      await refresh();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="diary-form"
      aria-label={entry ? `Edit ${entry.title}` : `Add to ${dayName(day)}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) saving.mutate();
      }}
    >
      <div className="pb-row pb-row--2">
        <label className="pb-field">
          <span>Time (blank for all day)</span>
          <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="pb-field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {DIARY_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_NAMES[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="pb-field">
        <span>Where, or what</span>
        <input
          value={title}
          maxLength={120}
          placeholder="Kayole water point"
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="pb-field">
        <span>Ward</span>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          <option value="">No ward</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="pb-field">
        <span>What it&apos;s for</span>
        <textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} />
      </label>
      {problem && title.trim() ? <p className="re-problem">{problem}</p> : null}
      <div className="re-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={Boolean(problem) || saving.isPending}
        >
          {entry ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
