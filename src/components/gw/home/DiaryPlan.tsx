import { Link } from "@tanstack/react-router";

import { dayName, KIND_NAMES, timeName, type DiaryEntry } from "@/lib/diary";

/**
 * Today's calendar, first on Home: where the candidate is to be and when, at a glance. On a phone
 * it used to come after the morning story, a long scroll down.
 */
export function TodayCalendar({
  plan,
  today,
  loading,
  canEdit,
}: {
  plan: DiaryEntry[];
  /** Nairobi's date today, YYYY-MM-DD. */
  today: string;
  /** Home's data is still on its way. */
  loading: boolean;
  canEdit: boolean;
}) {
  return (
    <section className="card mb-diary home-calendar" aria-labelledby="mb-diary-h">
      <div className="card-head">
        <h2 id="mb-diary-h">Today&apos;s calendar · {dayName(today)}</h2>
        <Link to="/diary" className="btn btn--ghost btn--sm">
          {canEdit ? "Plan the week" : "The week"}
        </Link>
      </div>
      {plan.length ? (
        <ol className="mb-time">
          {plan.map((e) => (
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
                {e.note ? <p className="mb-time-why">{e.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">
          {loading ? "Reading the calendar…" : "Nothing in the calendar for today."}
        </p>
      )}
    </section>
  );
}

/** What is coming up and what to watch over the next three days, from the calendar. */
export function DiaryPlan({
  watch,
  upcoming = [],
}: {
  watch: DiaryEntry[];
  upcoming?: DiaryEntry[];
}) {
  return (
    <>
      {upcoming.length > 0 && (
        <section className="mb-upcoming" aria-labelledby="mb-upcoming-h">
          <h2 id="mb-upcoming-h">Coming up</h2>
          <ol className="mb-time">
            {[...upcoming]
              .sort(
                (a, b) =>
                  a.day.localeCompare(b.day) || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""),
              )
              .map((entry) => (
                <li key={entry.id}>
                  <div className="mb-upcoming-date">
                    <span>{dayName(entry.day)}</span>
                    <span className="mb-time-at">{timeName(entry)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-time-place">{entry.title}</p>
                    <p className="mb-kind">
                      {KIND_NAMES[entry.kind]}
                      {entry.wardName ? ` · ${entry.wardName}` : ""}
                    </p>
                    {entry.note && <p className="mb-time-why">{entry.note}</p>}
                  </div>
                </li>
              ))}
          </ol>
        </section>
      )}
      {watch.length ? (
        <section className="card mb-watch" aria-labelledby="mb-watch-h">
          <div className="card-head">
            <h2 id="mb-watch-h">Watch list</h2>
          </div>
          <ul>
            {watch.map((e) => (
              <li key={e.id}>
                <p className="mb-watch-meta">
                  {dayName(e.day)}
                  {e.startsAt ? ` · ${e.startsAt}` : ""}
                  {e.wardName ? ` · ${e.wardName}` : ""}
                </p>
                <p className="mb-watch-t">{e.title}</p>
                {e.note ? <p className="mb-watch-d">{e.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
