import { ActionButton, Tag } from "@/components/gw/briefing/parts";
import type { Scenario } from "@/lib/demo/types";

/** The one story that matters this morning, then the rest of the news that touches the campaign. */
export function StoryBlock({ s }: { s: Scenario }) {
  const st = s.story;
  return (
    <article className="mb-story" aria-labelledby="mb-story-h">
      <p className="mb-story-kicker">
        <Tag tag={st.tag} /> {st.kicker} · {st.time}
      </p>
      <h2 id="mb-story-h" className="mb-story-h">
        {st.headline}
      </h2>
      <p className="mb-story-sum">{st.summary}</p>
      <dl className="mb-figs">
        {st.numbers.map((n) => (
          <div key={n.label}>
            <dt>{n.value}</dt>
            <dd>{n.label}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-story-cols">
        <div>
          <h3>How rivals are playing it</h3>
          <p>{st.rivals}</p>
        </div>
        <div className="mb-line">
          <h3>What to say</h3>
          <p>{st.line}</p>
        </div>
      </div>
      <div className="mb-actions">
        {st.actions.map((a, i) => (
          <ActionButton key={a.label} action={a} quiet={i > 0} />
        ))}
      </div>
      <p className="mb-source">Source: {st.source}</p>

      <h3 className="mb-sub">Also this morning</h3>
      <ul className="mb-news">
        {s.news.map((n) => (
          <li key={n.headline}>
            <p className="mb-news-meta">
              <Tag tag={n.tag} /> {n.time} · {n.source}
            </p>
            <p className="mb-news-h">{n.headline}</p>
            <p className="mb-news-so">{n.soWhat}</p>
            {n.action && (
              <div className="mb-actions">
                <ActionButton action={n.action} quiet />
              </div>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
