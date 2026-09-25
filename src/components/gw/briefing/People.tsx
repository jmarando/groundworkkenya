import { Delta, Level } from "@/components/gw/briefing/parts";
import { ShareBar } from "@/components/gw/demo/charts";
import { contender, ours } from "@/lib/demo";
import type { Scenario } from "@/lib/demo/types";

const nf = new Intl.NumberFormat("en-KE");

/** What each rival did yesterday, what they're saying, and what to watch for today. */
export function OpponentWatch({ s }: { s: Scenario }) {
  const us = ours(s);
  const theirs = s.opponents.reduce((t, o) => t + o.voice, 0);
  const parts = [
    { key: us.key, label: us.short, value: Math.max(0, 100 - theirs), tone: us.tone },
    ...s.opponents.map((o) => {
      const c = contender(s, o.key);
      return {
        key: o.key,
        label: c?.short ?? o.key,
        value: o.voice,
        tone: c?.tone ?? ("a" as const),
      };
    }),
  ];
  return (
    <section className="card mb-opp" aria-labelledby="mb-opp-h">
      <div className="card-head">
        <h2 id="mb-opp-h">Opponent watch</h2>
      </div>
      <p className="mb-label">Share of the conversation this week</p>
      <ShareBar parts={parts} label="Share of online and media conversation this week" />
      {s.opponents.map((o) => {
        const c = contender(s, o.key);
        return (
          <article key={o.key} className="mb-rival">
            <p className="mb-rival-h">
              <i className={`mb-swatch mb-swatch--${c?.tone ?? "a"}`} aria-hidden="true" />
              <b>{c?.name}</b> <span className="dim">{c?.party}</span>
              <span className="mb-rival-threat">
                Threat: <Level level={o.threat} />
              </span>
            </p>
            <dl className="mb-rival-dl">
              <dt>Yesterday</dt>
              <dd>{o.yesterday}</dd>
              <dt>Message</dt>
              <dd>{o.message}</dd>
              <dt>Spending</dt>
              <dd>{o.spend}</dd>
            </dl>
            <p className="mb-rival-watch">
              <b>Watch today:</b> {o.watch}
            </p>
          </article>
        );
      })}
    </section>
  );
}

/** What voters are raising, who is moving, in their own words. */
export function Voters({ s }: { s: Scenario }) {
  const v = s.voters;
  const top = Math.max(...v.issues.map((i) => i.share));
  return (
    <section className="card mb-voters" aria-labelledby="mb-voters-h">
      <div className="card-head">
        <h2 id="mb-voters-h">Voters</h2>
        <span className="mono">SMS, USSD, canvass and listening · this week</span>
      </div>
      <p className="mb-label">First issue, share of voters</p>
      <ul className="mb-issues">
        {v.issues.map((i) => (
          <li key={i.label}>
            <span className="mb-issue-l">{i.label}</span>
            <span className="mb-issue-bar" aria-hidden="true">
              <i style={{ width: `${(i.share / top) * 100}%` }} />
            </span>
            <b className="mb-issue-v">{i.share}%</b>
            <Delta value={i.change} unit=" pts" neutral />
            <small className="mb-issue-hot">{i.hot}</small>
          </li>
        ))}
      </ul>

      <p className="mb-label">Who is moving</p>
      <ul className="mb-groups">
        {v.groups.map((g) => (
          <li key={g.label}>
            <p>
              <b>{g.label}</b> <span className="dim">{g.size}</span>{" "}
              <Delta value={g.move} unit={g.move > 0 ? " to you" : " away"} />
            </p>
            <p className="dim">{g.note}</p>
          </li>
        ))}
      </ul>

      <p className="mb-label">In their words</p>
      <div className="mb-quotes">
        {v.quotes.map((q) => (
          <figure key={q.text}>
            <blockquote lang={q.translation ? "sw" : "en"}>“{q.text}”</blockquote>
            {q.translation && <p className="mb-quote-tr">{q.translation}</p>}
            <figcaption>
              {q.who} · {q.where}
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="mb-persuade">
        <b>{nf.format(v.persuadables.count)}</b> persuadable voters. {v.persuadables.note}
      </p>
    </section>
  );
}
