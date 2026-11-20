import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useCrowdActions, useDiaryRefresh, type Ward } from "@/components/gw/diary/hooks";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CROWD_KIND_NAMES, type CrowdEvent } from "@/lib/crowd-events";
import { cleanEntry, DIARY_KINDS, KIND_NAMES, type DiaryEntry } from "@/lib/diary";
import { whenName } from "@/lib/diary-calendar";
import { removeDiaryEntry, saveDiaryEntry } from "@/lib/diary.functions";

/** What the panel shows: an entry, its form, a new entry's form, or a crowd suggestion. */
export type Panel =
  | { mode: "entry"; id: string }
  | { mode: "edit"; id: string }
  | { mode: "new"; day: string; startsAt: string | null; wardId?: string | undefined }
  | { mode: "crowd"; id: string };

/** The panel beside the calendar (from the bottom on a phone): one entry or suggestion at a time. */
export function EntryPanel({
  panel,
  onOpen,
  onClose,
  entries,
  crowd,
  wards,
  briefs,
  finds,
  canEdit,
  side,
}: {
  panel: Panel | null;
  onOpen: (panel: Panel) => void;
  onClose: () => void;
  entries: DiaryEntry[];
  crowd: CrowdEvent[];
  wards: Ward[];
  /** A line from the last election, by entry id, for stops in a ward. */
  briefs: Record<string, string>;
  /** The stop's ward's findings, by entry id, for stops in the next seven days. */
  finds: Record<string, string[]>;
  canEdit: boolean;
  side: "right" | "bottom";
}) {
  // Focus goes back to the block (or button) that opened the panel when it closes.
  const returnTo = useRef<HTMLElement | null>(null);
  const isOpen = panel !== null;
  useLayoutEffect(() => {
    if (isOpen && !returnTo.current && document.activeElement instanceof HTMLElement) {
      returnTo.current = document.activeElement;
    }
  }, [isOpen]);
  return (
    // Not modal: the calendar stays in view and usable; a click outside closes the panel.
    <Sheet open={isOpen} modal={false} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent
        side={side}
        className={`cal-panel cal-panel--${side}`}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnTo.current?.focus();
          returnTo.current = null;
        }}
      >
        {panel?.mode === "entry" || panel?.mode === "edit" ? (
          <EntryBody
            key={`${panel.mode}:${panel.id}`}
            entry={entries.find((e) => e.id === panel.id) ?? null}
            editing={panel.mode === "edit"}
            wards={wards}
            brief={briefs[panel.id] ?? null}
            finds={finds[panel.id] ?? []}
            canEdit={canEdit}
            onOpen={onOpen}
            onClose={onClose}
          />
        ) : panel?.mode === "new" ? (
          <>
            <SheetHeader className="cal-panel-head">
              <SheetTitle className="cal-panel-title">Add to the diary</SheetTitle>
              <SheetDescription className="cal-panel-when">
                Leave the time blank for something that takes all day.
              </SheetDescription>
            </SheetHeader>
            <EntryForm
              key={`${panel.day}:${panel.startsAt ?? ""}:${panel.wardId ?? ""}`}
              entry={null}
              start={panel}
              wards={wards}
              onDone={onClose}
              onCancel={onClose}
            />
          </>
        ) : panel?.mode === "crowd" ? (
          <CrowdBody
            key={panel.id}
            event={crowd.find((c) => c.id === panel.id) ?? null}
            canEdit={canEdit}
            onOpen={onOpen}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EntryBody({
  entry,
  editing,
  wards,
  brief,
  finds,
  canEdit,
  onOpen,
  onClose,
}: {
  entry: DiaryEntry | null;
  editing: boolean;
  wards: Ward[];
  brief: string | null;
  finds: string[];
  canEdit: boolean;
  onOpen: (panel: Panel) => void;
  onClose: () => void;
}) {
  if (!entry) {
    return (
      <SheetHeader className="cal-panel-head">
        <SheetTitle className="cal-panel-title">Not in the diary any more</SheetTitle>
        <SheetDescription className="cal-panel-when">
          Someone may have moved it to a day that isn&apos;t on screen, or removed it.
        </SheetDescription>
      </SheetHeader>
    );
  }
  if (editing) {
    return (
      <>
        <SheetHeader className="cal-panel-head">
          <SheetTitle className="cal-panel-title">Change {entry.title}</SheetTitle>
          <SheetDescription className="cal-panel-when">
            {whenName(entry.day, entry.startsAt)}
          </SheetDescription>
        </SheetHeader>
        <EntryForm
          entry={entry}
          wards={wards}
          onDone={() => onOpen({ mode: "entry", id: entry.id })}
          onCancel={() => onOpen({ mode: "entry", id: entry.id })}
        />
      </>
    );
  }
  return (
    <>
      <SheetHeader className="cal-panel-head">
        <p className="diary-entry-kind">
          {KIND_NAMES[entry.kind]}
          {entry.wardName ? ` · ${entry.wardName}` : ""}
        </p>
        <SheetTitle className="cal-panel-title">{entry.title}</SheetTitle>
        <SheetDescription className="cal-panel-when">
          {whenName(entry.day, entry.startsAt)}
        </SheetDescription>
      </SheetHeader>
      {entry.note ? <p className="cal-panel-note">{linked(entry.note)}</p> : null}
      {brief ? (
        <p className="diary-brief" title="The last election here, from the atlas">
          {brief}
        </p>
      ) : null}
      {finds.length ? (
        <ul className="diary-finds" aria-label="What the records say here">
          {finds.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <div className="cal-panel-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onOpen({ mode: "edit", id: entry.id })}
          >
            Edit
          </button>
          <RemoveEntry entry={entry} onRemoved={onClose} />
        </div>
      ) : null}
    </>
  );
}

/** A note with its web addresses as links named by their site (a crowd event's note carries its source's). */
function linked(note: string) {
  return note.split(/(https:\/\/[^\s]+)/).map((part, i) => {
    if (!part.startsWith("https://")) return part;
    let site = part;
    try {
      site = new URL(part).hostname.replace(/^www\./, "");
    } catch {
      // Not a full address: shown as written.
    }
    return (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {site}
      </a>
    );
  });
}

function RemoveEntry({ entry, onRemoved }: { entry: DiaryEntry; onRemoved: () => void }) {
  const [sure, setSure] = useState(false);
  const remove = useServerFn(removeDiaryEntry);
  const refresh = useDiaryRefresh();
  const removing = useMutation({
    mutationFn: () => remove({ data: { id: entry.id } }),
    onSuccess: async () => {
      toast.success("Removed from the calendar.");
      onRemoved();
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm cal-remove${sure ? " is-sure" : ""}`}
      onClick={() => (sure ? removing.mutate() : setSure(true))}
      onBlur={() => setSure(false)}
      disabled={removing.isPending}
    >
      {sure ? "Remove it?" : "Remove"}
    </button>
  );
}

/** Add or change an entry. A new one starts on the day and time clicked, and the ward of a finding's "Plan a visit". */
function EntryForm({
  entry,
  start,
  wards,
  onDone,
  onCancel,
}: {
  entry: DiaryEntry | null;
  start?: { day: string; startsAt: string | null; wardId?: string | undefined };
  wards: Ward[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(entry?.day ?? start?.day ?? "");
  const [startsAt, setStartsAt] = useState(entry?.startsAt ?? start?.startsAt ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [kind, setKind] = useState<string>(entry?.kind ?? "visit");
  const [wardId, setWardId] = useState(entry?.wardId ?? start?.wardId ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const save = useServerFn(saveDiaryEntry);
  const refresh = useDiaryRefresh();

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
      toast.success(entry ? "Calendar updated." : "Added to the calendar.");
      await refresh();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="diary-form"
      aria-label={entry ? `Change ${entry.title}` : "Add to the diary"}
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) saving.mutate();
      }}
    >
      <div className="pb-row pb-row--2">
        <label className="pb-field">
          <span>Day</span>
          <input type="date" value={day} required onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="pb-field">
          <span>Time (blank for all day)</span>
          <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
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
      <div className="pb-row pb-row--2">
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
      </div>
      <label className="pb-field">
        <span>What it&apos;s for</span>
        <textarea value={note} maxLength={300} rows={3} onChange={(e) => setNote(e.target.value)} />
      </label>
      {problem && title.trim() ? <p className="re-problem">{problem}</p> : null}
      <div className="re-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
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

function CrowdBody({
  event,
  canEdit,
  onOpen,
  onClose,
}: {
  event: CrowdEvent | null;
  canEdit: boolean;
  onOpen: (panel: Panel) => void;
  onClose: () => void;
}) {
  if (!event) {
    return (
      <SheetHeader className="cal-panel-head">
        <SheetTitle className="cal-panel-title">No longer suggested</SheetTitle>
        <SheetDescription className="cal-panel-when">
          Someone has added it to the diary or set it aside.
        </SheetDescription>
      </SheetHeader>
    );
  }
  return <CrowdDetails event={event} canEdit={canEdit} onOpen={onOpen} onClose={onClose} />;
}

function CrowdDetails({
  event: e,
  canEdit,
  onOpen,
  onClose,
}: {
  event: CrowdEvent;
  canEdit: boolean;
  onOpen: (panel: Panel) => void;
  onClose: () => void;
}) {
  // Added: its new entry opens, so the suggestion is seen to become a diary entry.
  const { adding, setting, busy } = useCrowdActions(e, {
    onAdded: (entryId) => onOpen({ mode: "entry", id: entryId }),
    onSetAside: onClose,
  });
  const where = [e.place, e.wardName].filter(Boolean).join(" · ");
  return (
    <>
      <SheetHeader className="cal-panel-head">
        <p className="diary-entry-kind cal-suggested">Suggested · {CROWD_KIND_NAMES[e.kind]}</p>
        <SheetTitle className="cal-panel-title">{e.title}</SheetTitle>
        <SheetDescription className="cal-panel-when">
          {whenName(e.day, e.startsAt)}
          {where ? ` · ${where}` : ""}
        </SheetDescription>
      </SheetHeader>
      {e.crowd || e.why ? (
        <p className="cal-panel-note">{[e.crowd, e.why].filter(Boolean).join(". ")}</p>
      ) : null}
      <p className="cal-panel-src">
        <a href={e.url} target="_blank" rel="noreferrer">
          {e.sourceName ? `Read it in ${e.sourceName}` : "Read the source"}
        </a>
      </p>
      {e.status === "added" ? (
        <p className="crowd-added">In the diary</p>
      ) : canEdit ? (
        <div className="cal-panel-actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => adding.mutate()}
            disabled={busy}
          >
            Add to the diary
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setting.mutate()}
            disabled={busy}
          >
            Not for us
          </button>
        </div>
      ) : null}
      <p className="mb-source">
        Found in the news for your area. Nothing goes into the diary until someone adds it.
      </p>
    </>
  );
}
