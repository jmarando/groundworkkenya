import type {
  CalendarOptions,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventMountArg,
} from "@fullcalendar/core";
import enGb from "@fullcalendar/core/locales/en-gb";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EntryPanel, type Panel } from "@/components/gw/diary/EntryPanel";
import {
  useBriefs,
  useCrowdEvents,
  useDiaryRefresh,
  useStopFindings,
} from "@/components/gw/diary/hooks";
import { useAccess } from "@/hooks/useAccess";
import { useIsMobile } from "@/hooks/use-mobile";
import { KIND_NAMES } from "@/lib/diary";
import {
  CALENDAR_VIEWS,
  crowdEvents,
  dropTarget,
  entryEvents,
  nairobiNow,
  shownDays,
  slotBounds,
  startView,
  stepNames,
  whenName,
  type CalendarItem,
  type CalendarView,
} from "@/lib/diary-calendar";
import { getDiaryRange, saveDiaryEntry } from "@/lib/diary.functions";

const VIEW_KEY = "gw-diary-view";
const savedView = (): string | null => {
  try {
    return window.localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
};
const keepView = (view: string) => {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // A private window keeps nothing; the calendar still works.
  }
};
const narrow = () => typeof window !== "undefined" && window.innerWidth < 768;

// What never changes, made once, so FullCalendar isn't handed new options on every render.
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin];
const LOCALES = [enGb];
const NOW = () => nairobiNow();
const CLOCK = { hour: "2-digit", minute: "2-digit", hour12: false } as const;
const TITLE = { day: "numeric", month: "short", year: "numeric" } as const;
const VIEWS: NonNullable<CalendarOptions["views"]> = {
  timeGridWeek: { dayHeaderFormat: { weekday: "short", day: "numeric" } },
  timeGridDay: { dayHeaderFormat: { weekday: "long", day: "numeric", month: "long" } },
  dayGridMonth: {
    dayHeaderFormat: { weekday: "short" },
    titleFormat: { month: "long", year: "numeric" },
    eventDisplay: "block",
    dayMaxEvents: 3,
  },
  listWeek: {
    listDayFormat: { weekday: "long", day: "numeric", month: "long" },
    listDaySideFormat: false,
  },
};

/**
 * A block: its time (or kind) and ward on top, its title under it; a suggestion says so. In
 * Schedule, a line with the kind and ward over the title.
 */
function renderEvent(arg: EventContentArg) {
  const item = arg.event.extendedProps as CalendarItem;
  const where = item.type === "entry" ? item.ward : item.place;
  const label = item.type === "crowd" ? "Suggested" : KIND_NAMES[item.kind];
  if (arg.view.type.startsWith("list")) {
    return (
      <span className="cal-li">
        <span className="cal-li-kind">
          {label}
          {where ? ` · ${where}` : ""}
        </span>
        <span className="cal-li-title">{arg.event.title}</span>
      </span>
    );
  }
  // All day: the title alone; the colour (or the dashes of a suggestion) says the rest.
  if (arg.event.allDay) {
    return (
      <span className="cal-ev-in">
        <span className="cal-ev-title">{arg.event.title}</span>
      </span>
    );
  }
  // A month's day is narrow: there the dashes alone mark a suggestion.
  const first =
    item.type === "crowd" && !arg.view.type.startsWith("dayGrid")
      ? `Suggested${arg.timeText ? ` · ${arg.timeText}` : ""}`
      : arg.timeText || label;
  return (
    <span className="cal-ev-in">
      <span className="cal-ev-top">
        {first}
        {where && item.type === "entry" ? <span className="cal-ev-where"> · {where}</span> : null}
      </span>
      <span className="cal-ev-title">{arg.event.title}</span>
    </span>
  );
}

/** Each block's name for screen readers: "Visit: Referral hospital, Fri 20 Nov, 14:30, Municipality". */
function nameEvent(arg: EventMountArg) {
  const item = arg.event.extendedProps as CalendarItem;
  const day = arg.event.startStr.slice(0, 10);
  const time = arg.event.allDay ? null : arg.event.startStr.slice(11, 16);
  const kind = item.type === "crowd" ? "Suggested" : KIND_NAMES[item.kind];
  const where = item.type === "entry" ? item.ward : item.place;
  arg.el.setAttribute(
    "aria-label",
    `${kind}: ${arg.event.title}, ${whenName(day, time)}${where ? `, ${where}` : ""}`,
  );
}

export type Shown = { title: string; from: string; to: string; date: string };

/**
 * The diary as a calendar, like Google Calendar: Day, Week, Month and Schedule. Click an entry
 * for its panel, an empty time to add one there, drag to move. Crowd events nobody has decided
 * on show as dashed suggestions to add or set aside.
 */
export function DiaryCalendar({
  initialDate,
  addWard,
  canEdit,
  showCrowd,
  onShown,
}: {
  /** ?week=: open on the week (or day, or month) that holds this day. */
  initialDate?: string | undefined;
  /** A finding's "Plan a visit": the add form opens for today with this ward chosen. */
  addWard?: string | undefined;
  canEdit: boolean;
  /** The office sees crowd events; others are never sent them. */
  showCrowd: boolean;
  onShown: (shown: Shown) => void;
}) {
  const ref = useRef<FullCalendar>(null);
  const phone = useIsMobile();
  const [view, setView] = useState<CalendarView>(() => startView(savedView(), narrow()));
  // FullCalendar reads its first day and view once.
  const [firstDate] = useState(initialDate);
  const [firstView] = useState(view);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);

  const { campaign } = useAccess();
  const fetchRange = useServerFn(getDiaryRange);
  const { data, isError, isFetching } = useQuery({
    queryKey: ["diary", campaign?.id ?? null, range?.from ?? null, range?.to ?? null],
    queryFn: () => fetchRange({ data: range! }),
    enabled: Boolean(campaign?.id && range),
    placeholderData: keepPreviousData,
  });
  const crowd = useCrowdEvents(showCrowd);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const wards = useMemo(() => data?.wards ?? [], [data]);
  const suggestions = useMemo(
    () => (showCrowd ? (crowd.data?.events ?? []) : []),
    [showCrowd, crowd.data],
  );
  const today = data?.today ?? nairobiNow().slice(0, 10);
  const events = useMemo(
    () => [...entryEvents(entries, canEdit), ...crowdEvents(suggestions)],
    [entries, canEdit, suggestions],
  );
  const bounds = useMemo(() => slotBounds(events), [events]);
  const { briefs, shared } = useBriefs(entries, wards);
  const finds = useStopFindings(entries, today);

  // "Plan a visit" from a finding: today's form, that ward chosen.
  useEffect(() => {
    if (canEdit && addWard) {
      setPanel({ mode: "new", day: nairobiNow().slice(0, 10), startsAt: null, wardId: addWard });
    }
  }, [canEdit, addWard]);

  const save = useServerFn(saveDiaryEntry);
  const refresh = useDiaryRefresh();

  const api = () => ref.current?.getApi();
  const choose = (next: CalendarView) => {
    setView(next);
    keepView(next);
    api()?.changeView(next);
  };
  const names = stepNames(view);

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const days = shownDays(arg.start, arg.end);
      setRange((r) => (r && r.from === days.from && r.to === days.to ? r : days));
      onShown({
        title: arg.view.title,
        ...days,
        date: arg.view.currentStart.toISOString().slice(0, 10),
      });
    },
    [onShown],
  );

  const onEventClick = useCallback((arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    const item = arg.event.extendedProps as CalendarItem;
    setPanel(
      item.type === "entry" ? { mode: "entry", id: item.id } : { mode: "crowd", id: item.id },
    );
  }, []);

  const onDateClick = useCallback((arg: DateClickArg) => {
    const { day, startsAt } = dropTarget(arg.date, arg.allDay);
    setPanel({ mode: "new", day, startsAt });
  }, []);

  const onEventDrop = useCallback(
    async (arg: EventDropArg) => {
      const item = arg.event.extendedProps as CalendarItem;
      const entry = item.type === "entry" ? entries.find((e) => e.id === item.id) : undefined;
      if (!entry || !arg.event.start) {
        arg.revert();
        return;
      }
      const to = dropTarget(arg.event.start, arg.event.allDay);
      try {
        await save({
          data: {
            id: entry.id,
            day: to.day,
            startsAt: to.startsAt ?? "",
            title: entry.title,
            kind: entry.kind,
            wardId: entry.wardId ?? "",
            note: entry.note ?? "",
          },
        });
        toast.success(`Moved to ${whenName(to.day, to.startsAt)}.`);
        await refresh();
      } catch (e) {
        arg.revert();
        toast.error((e as Error).message);
      }
    },
    [entries, save, refresh],
  );

  return (
    <>
      {shared ? (
        <p className="diary-seat" title="The last election here, from the atlas">
          <span>The seat last time</span> {shared}
        </p>
      ) : null}
      <div className="cal-bar">
        <div className="cal-nav">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => api()?.today()}>
            Today
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm cal-step"
            aria-label={names.back}
            title={names.back}
            onClick={() => api()?.prev()}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm cal-step"
            aria-label={names.next}
            title={names.next}
            onClick={() => api()?.next()}
          >
            ›
          </button>
        </div>
        <div className="cal-views" role="group" aria-label="Show the diary by">
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v.type}
              type="button"
              aria-pressed={view === v.type}
              onClick={() => choose(v.type)}
            >
              {v.label}
            </button>
          ))}
        </div>
        {canEdit ? (
          <button
            type="button"
            className="btn btn--primary btn--sm cal-add"
            onClick={() => setPanel({ mode: "new", day: today, startsAt: null })}
          >
            Add
          </button>
        ) : null}
      </div>
      {isError ? <p className="re-problem">Could not read the diary. Try again.</p> : null}
      <div
        className={`diary-cal${isFetching ? " is-reading" : ""}${canEdit ? " can-edit" : ""}`}
        aria-busy={isFetching}
      >
        <FullCalendar
          ref={ref}
          plugins={PLUGINS}
          locales={LOCALES}
          locale="en-gb"
          timeZone="UTC"
          now={NOW}
          initialView={firstView}
          {...(firstDate ? { initialDate: firstDate } : {})}
          headerToolbar={false}
          firstDay={1}
          height="auto"
          allDayText="All day"
          nowIndicator
          slotMinTime={bounds.min}
          slotMaxTime={bounds.max}
          scrollTime="07:00:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00"
          slotLabelFormat={CLOCK}
          eventTimeFormat={CLOCK}
          displayEventEnd={false}
          titleFormat={TITLE}
          views={VIEWS}
          events={events}
          eventContent={renderEvent}
          eventDidMount={nameEvent}
          eventClick={onEventClick}
          {...(canEdit ? { dateClick: onDateClick } : {})}
          editable={canEdit}
          eventDurationEditable={false}
          eventInteractive
          eventDrop={onEventDrop}
          datesSet={onDatesSet}
          longPressDelay={400}
          noEventsContent="Nothing planned."
        />
      </div>
      <EntryPanel
        panel={panel}
        onOpen={setPanel}
        onClose={() => setPanel(null)}
        entries={entries}
        crowd={suggestions}
        wards={wards}
        briefs={briefs}
        finds={finds}
        canEdit={canEdit}
        side={phone ? "bottom" : "right"}
      />
    </>
  );
}
