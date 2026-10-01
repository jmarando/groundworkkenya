import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { DiaryWeek } from "@/components/gw/diary/DiaryWeek";
import { useAccess } from "@/hooks/useAccess";
import { addDays, dayName } from "@/lib/diary";
import { getDiaryWeek } from "@/lib/diary.functions";

export const Route = createFileRoute("/_authenticated/diary")({
  // ?week=2026-10-05: the week that holds that day; none: this week.
  validateSearch: (search: Record<string, unknown>): { week?: string } => {
    const w = typeof search["week"] === "string" ? search["week"] : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(w) ? { week: w } : {};
  },
  component: DiaryPage,
  head: () => ({
    meta: [
      { title: "Diary · Groundwork" },
      {
        name: "description",
        content:
          "Where the candidate will be, planned a week at a time, and what to keep an eye on.",
      },
      { property: "og:title", content: "Diary · Groundwork" },
      {
        property: "og:description",
        content:
          "Where the candidate will be, planned a week at a time, and what to keep an eye on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function DiaryPage() {
  const { week } = Route.useSearch();
  const { campaign, isPrincipal } = useAccess();
  const fetchWeek = useServerFn(getDiaryWeek);
  const { data, isError } = useQuery({
    queryKey: ["diary", campaign?.id ?? null, week ?? null],
    queryFn: () => fetchWeek({ data: week ? { week } : {} }),
    enabled: Boolean(campaign?.id),
  });
  const first = data?.days[0];
  return (
    <section className="view active" aria-label="Diary">
      <div className="diary">
        <div className="diary-head">
          <div>
            <span className="eyebrow">Operate · Diary</span>
            <h1>{first ? `Week of ${dayName(first)}` : "The diary"}</h1>
            <p className="meta">
              Where the candidate will be, and what to keep an eye on.{" "}
              {isPrincipal ? "Plan the week here; Home shows each day." : "Home shows each day."}
            </p>
          </div>
          {first ? (
            <nav className="diary-nav" aria-label="Weeks">
              <Link
                to="/diary"
                search={{ week: addDays(first, -7) }}
                className="btn btn--ghost btn--sm"
              >
                ‹ Last week
              </Link>
              <Link to="/diary" search={{}} className="btn btn--ghost btn--sm">
                This week
              </Link>
              <Link
                to="/diary"
                search={{ week: addDays(first, 7) }}
                className="btn btn--ghost btn--sm"
              >
                Next week ›
              </Link>
            </nav>
          ) : null}
        </div>
        {data ? (
          <DiaryWeek week={data} canEdit={isPrincipal} />
        ) : (
          <p className="meta">{isError ? "Could not read the diary." : "Reading the diary…"}</p>
        )}
      </div>
    </section>
  );
}
