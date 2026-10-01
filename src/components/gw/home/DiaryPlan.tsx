import { Link } from "@tanstack/react-router";

import { dayName, KIND_NAMES, timeName, type DiaryEntry } from "@/lib/diary";

/** Where to be today, and what to watch over the next three days, from the diary. */
export function DiaryPlan({
  plan,
  watch,
  canEdit,
}: {
  plan: DiaryEntry[];
  watch: DiaryEntry[];
  canEdit: boolean;
}) {
  return (
    <>
      <section className="card mb-diary" aria-labelledby="mb-diary-h">
        <div className="card-head">
          <h2 id="mb-diary-h">Where to be today</h2>
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
          <p className="meta">Nothing in the diary for today.</p>
        )}
      </section>
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
