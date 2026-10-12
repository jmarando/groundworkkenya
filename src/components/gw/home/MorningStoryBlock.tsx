import { kicker, noStoryLine, type StoryView } from "@/lib/morning-story";

/** This morning's story: its kicker, the story with its sources, and the morning's other news. */
export function MorningStoryBlock({
  view,
  loading,
  time,
  canEdit,
  onEdit,
}: {
  view: StoryView | null;
  /** Home's data is still on its way: say so, not that there is no news. */
  loading: boolean;
  /** Nairobi's time now, HH:MM. */
  time: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  if (!view) {
    return (
      <article className="mb-story" aria-labelledby="mb-story-h">
        <h2 id="mb-story-h" className="mb-sub">
          This morning&apos;s story
        </h2>
        <p className="mb-story-sum">{noStoryLine(loading, time)}</p>
        {canEdit && !loading ? (
          <div className="mb-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={onEdit}>
              Write today&apos;s story
            </button>
          </div>
        ) : null}
      </article>
    );
  }
  const st = view.story;
  return (
    <article className="mb-story" aria-labelledby="mb-story-h">
      <p className="mb-story-kicker">
        {kicker(view)}
        {canEdit ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>
            {st.kind === "written" ? "Edit" : "Write today's story"}
          </button>
        ) : null}
      </p>
      {st.kind === "written" ? (
        <>
          <h2 id="mb-story-h" className="mb-story-h">
            {st.headline}
          </h2>
          <p className="mb-story-sum">{st.summary}</p>
          {st.why ? <p className="mb-story-sum">{st.why}</p> : null}
          {st.figures.length ? (
            <dl className="mb-figs">
              {st.figures.map((f) => (
                <div key={f.label}>
                  <dt>{f.value}</dt>
                  <dd>{f.label}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {st.rivals || st.line ? (
            <div className="mb-story-cols">
              {st.rivals ? (
                <div>
                  <h3>How rivals are playing it</h3>
                  <p>{st.rivals}</p>
                </div>
              ) : null}
              {st.line ? (
                <div className="mb-line">
                  <h3>Suggested line</h3>
                  <p>{st.line}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {st.sources.length ? (
            <p className="mb-source">
              Sources:{" "}
              {st.sources.map((s, i) => (
                <span key={s.url}>
                  {i ? " · " : ""}
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.source}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </>
      ) : (
        <h2 id="mb-story-h" className="mb-story-h">
          This morning&apos;s top stories
        </h2>
      )}
    </article>
  );
}

/** The other headlines span Home beneath the lead story and diary. */
export function MorningNews({ view }: { view: StoryView | null }) {
  if (!view?.story.also.length) return null;
  const st = view.story;
  return (
    <section aria-label={st.kind === "written" ? "Also this morning" : "Morning headlines"}>
      {st.kind === "written" ? <h3 className="text-[15px] font-bold">Also this morning</h3> : null}
      <ul className="mb-news grid grid-cols-1 gap-x-8 md:grid-cols-2">
        {st.also.map((n) => (
          <li key={n.url} className="min-w-0">
            <p className="mb-news-meta">{n.source}</p>
            <p className="mb-news-h break-words">
              <a href={n.url} target="_blank" rel="noopener noreferrer">
                {n.title}
              </a>
            </p>
            {n.soWhat ? <p className="mb-news-so">{n.soWhat}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
