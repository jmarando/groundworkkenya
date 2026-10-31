import {
  carriedLine,
  kicker,
  noStoryLine,
  outletOf,
  SCOPE_NAMES,
  type StoryLink,
  type StoryView,
} from "@/lib/morning-story";

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Africa/Nairobi",
      })
    : null;

/** Who published it, where it sits (the seat, the county, a rival, the nation) and when. */
function LinkMeta({ link }: { link: StoryLink }) {
  const when = shortDate(link.publishedAt);
  return (
    <span className="mb-link-meta">
      {link.scope ? (
        <span className={`mb-scope mb-scope--${link.scope}`}>
          {link.scope === "rival" && link.about ? link.about : SCOPE_NAMES[link.scope]}
        </span>
      ) : null}
      <span>{outletOf(link)}</span>
      {when ? <span>{when}</span> : null}
    </span>
  );
}

/** A list of links, each with who published it and when. */
function LinkList({ links }: { links: StoryLink[] }) {
  return (
    <ul className="mb-links">
      {links.map((l) => (
        <li key={l.url}>
          <LinkMeta link={l} />
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            {l.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** This morning's story: its kicker, the story with its sources, and the morning's other news. */
export function MorningStoryBlock({
  view,
  loading,
  today,
  time,
  canEdit,
  onEdit,
  separateDetails = false,
}: {
  view: StoryView | null;
  /** Home's data is still on its way: say so, not that there is no news. */
  loading: boolean;
  /** Nairobi's date today: an earlier day's story says it is one. None in the archive. */
  today?: string;
  /** Nairobi's time now, HH:MM. */
  time: string;
  canEdit: boolean;
  onEdit: () => void;
  separateDetails?: boolean;
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
  const carried = today ? carriedLine(view, today) : null;
  return (
    <article className="mb-story" aria-labelledby="mb-story-h">
      {carried ? (
        <p className="mb-story-sum morning-status" role="status">
          {carried}
        </p>
      ) : null}
      <p className="mb-story-kicker">
        {kicker(view)}
        {canEdit ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>
            {st.kind === "written" && !carried ? "Edit" : "Write today's story"}
          </button>
        ) : null}
      </p>
      {st.kind === "written" ? (
        <>
          <h2 id="mb-story-h" className="mb-story-h">
            {st.headline}
          </h2>
          <p className="mb-story-sum">{st.summary}</p>
          {!separateDetails && <MorningStoryDetails view={view} />}
        </>
      ) : (
        <>
          {/* Headlines with a lead lead with it: the top item's own words, never an empty top. */}
          <h2 id="mb-story-h" className="mb-story-h">
            {st.headline ?? (st.from ? "This morning’s top stories" : "This morning’s check")}
          </h2>
          {st.summary && (
            <p className={st.headline ? "mb-story-sum" : "mb-story-sum morning-status"}>
              {st.summary}
            </p>
          )}
          {st.headline && st.sources[0] ? (
            <p className="mb-source">
              <a href={st.sources[0].url} target="_blank" rel="noopener noreferrer">
                {outletOf(st.sources[0])} ↗
              </a>
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}

/** Supporting analysis can span the space below the story and today's plan. */
export function MorningStoryDetails({ view }: { view: StoryView | null }) {
  if (!view || view.story.kind !== "written") return null;
  const st = view.story;
  return (
    <div className="mb-story-details">
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
      {st.rivals || st.rivalsLately.length || st.line ? (
        <div className="mb-story-cols">
          {st.rivals ? (
            <div>
              <h3>How rivals are playing it</h3>
              <p>{st.rivals}</p>
              {st.rivalSources.length ? <LinkList links={st.rivalSources} /> : null}
            </div>
          ) : st.rivalsLately.length ? (
            <div>
              <h3>Rivals lately</h3>
              <p className="mb-source">Not on this story, but out this week:</p>
              <LinkList links={st.rivalsLately} />
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
        <div className="mb-sources">
          <h3>Where this comes from</h3>
          <LinkList links={st.sources} />
        </div>
      ) : null}
    </div>
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
            <p className="mb-news-meta">
              <LinkMeta link={n} />
            </p>
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
