import { Link } from "@tanstack/react-router";

import { MIND_SOURCES, mindBasis, pct, SOURCE_NAMES, type TopOfMind } from "@/lib/top-of-mind";

const isWeb = (u: string | null): u is string => Boolean(u && /^https?:\/\//i.test(u));

/** The week's top issues, each with what every source made of it. */
export function TopOfMindCard({ mind }: { mind: TopOfMind }) {
  return (
    <section className="card home-mind" aria-labelledby="home-mind-h">
      <div className="card-head">
        <div>
          <h2 id="home-mind-h">Top of mind this week</h2>
          <p className="meta">{mindBasis(mind)}</p>
        </div>
      </div>
      {mind.lines.length ? (
        <ol className="home-mind-list">
          {mind.lines.map((l) => (
            <li key={l.key}>
              <div className="home-mind-head">
                <Link to="/listening" search={{ issue: l.key }}>
                  <b>{l.label}</b>
                </Link>
                <span className="home-mind-score">{pct(l.score)}</span>
              </div>
              <dl className="home-mind-bars">
                {MIND_SOURCES.map((s) => {
                  const share = l.shares[s];
                  return (
                    <div key={s}>
                      <dt>{SOURCE_NAMES[s]}</dt>
                      <dd>
                        {share === null ? (
                          <span className="dim">no data</span>
                        ) : (
                          <>
                            <span className="home-mind-bar" aria-hidden="true">
                              <i style={{ width: pct(share) }} />
                            </span>
                            {pct(share)}
                          </>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {l.examples.map((e) => (
                <p key={e.text} className="home-issue-line">
                  {isWeb(e.url) ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer">
                      {e.text}
                    </a>
                  ) : (
                    e.text
                  )}
                </p>
              ))}
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">
          Listening, the inbox and the field app fill this in as the week goes.
        </p>
      )}
    </section>
  );
}
