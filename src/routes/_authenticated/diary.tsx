import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { CalendarLink } from "@/components/gw/diary/CalendarLink";
import { CrowdEvents } from "@/components/gw/diary/CrowdEvents";
import { DiaryCalendar, type Shown } from "@/components/gw/diary/DiaryCalendar";
import { PlaceFindings } from "@/components/gw/findings/SoWhat";
import { useAccess } from "@/hooks/useAccess";
import { nairobiNow } from "@/lib/diary-calendar";

export const Route = createFileRoute("/_authenticated/diary")({
  // ?week=2026-10-05: the calendar opens on the week (day, month) that holds that day; none:
  // this week. ?add=<ward id>: a finding's "Plan a visit", which opens today's form with that
  // ward chosen.
  validateSearch: (search: Record<string, unknown>): { week?: string; add?: string } => {
    const w = typeof search["week"] === "string" ? search["week"] : "";
    const a = typeof search["add"] === "string" ? search["add"] : "";
    return {
      ...(/^\d{4}-\d{2}-\d{2}$/.test(w) ? { week: w } : {}),
      ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a)
        ? { add: a }
        : {}),
    };
  },
  component: DiaryPage,
  head: () => ({
    meta: [
      { title: "Calendar · Groundwork" },
      {
        name: "description",
        content: "Where the candidate will be, by day, week or month, and what to keep an eye on.",
      },
      { property: "og:title", content: "Calendar · Groundwork" },
      {
        property: "og:description",
        content: "Where the candidate will be, by day, week or month, and what to keep an eye on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function DiaryPage() {
  const { week, add } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { isPrincipal, access } = useAccess();
  const role = access?.role;
  const office =
    role === "super" || role === "candidate" || role === "manager" || role === "organiser";
  const [shown, setShown] = useState<Shown | null>(null);

  // Keep the address on what is shown, so a reload or a shared link opens the same place;
  // the week that holds today needs no ?week=.
  const onShown = useCallback(
    (next: Shown) => {
      setShown(next);
      const today = nairobiNow().slice(0, 10);
      const wanted = next.from <= today && today <= next.to ? undefined : next.date;
      if (wanted !== week) {
        void navigate({
          search: (prev) => ({
            ...(prev.add ? { add: prev.add } : {}),
            ...(wanted ? { week: wanted } : {}),
          }),
          replace: true,
        });
      }
    },
    [navigate, week],
  );

  return (
    <section className="view active" aria-label="Calendar">
      <div className="diary">
        <div className="diary-head">
          <div>
            <span className="eyebrow">Operate · Calendar & events</span>
            <h1>{shown?.title ?? "The calendar"}</h1>
            <p className="meta">
              Where the candidate will be, and what to keep an eye on.{" "}
              {isPrincipal
                ? "Click a time to add, drag to move; Home shows each day."
                : "Home shows each day."}
            </p>
          </div>
          <nav className="diary-nav" aria-label="The diary">
            <Link
              to="/archive"
              search={{ month: (shown?.date ?? nairobiNow()).slice(0, 7) }}
              className="btn btn--ghost btn--sm"
            >
              Archive
            </Link>
          </nav>
        </div>
        <PlaceFindings
          place={null}
          decisions={["time"]}
          max={3}
          title="Where the candidate's time goes"
        />
        <DiaryCalendar
          initialDate={week}
          addWard={add}
          canEdit={isPrincipal}
          showCrowd={office}
          onShown={onShown}
        />
        {office ? <CrowdEvents canEdit={isPrincipal} /> : null}
        {office ? <CalendarLink /> : null}
      </div>
    </section>
  );
}
