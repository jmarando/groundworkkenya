// Home's strategy at a glance, after Today: this week's moves, the road to election day, what is
// spreading online and the latest wider story read for the seat. Four short cards, each opening
// the page that holds the rest. Nothing shows until there is something to say.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { SectionHead } from "@/components/gw/home/SectionHead";
import { daysUntil } from "@/lib/election-calendar";
import { nf, shortDay } from "@/lib/format";
import { getHomeStrategy } from "@/lib/home-strategy.functions";
import { sourceName } from "@/lib/listening-read";

const STANCE: Record<string, { label: string; cls: string }> = {
  strength: { label: "Helps", cls: "pill--ok" },
  threat: { label: "Hurts", cls: "pill--red" },
  opening: { label: "Opening", cls: "pill--amber" },
  context: { label: "Context", cls: "pill--muted" },
};

const span = (on: string, until: string) =>
  on === until ? shortDay(on) : `${shortDay(on)} – ${shortDay(until)}`;

export function StrategyBlock() {
  const fetch = useServerFn(getHomeStrategy);
  const { data } = useQuery({
    queryKey: ["home-strategy"],
    queryFn: () => fetch(),
    retry: false,
  });
  if (!data) return null;
  const nextIn = data.next ? daysUntil(data.today, data.next.on) : null;

  return (
    <section className="home-sec" aria-labelledby="home-strategy">
      <SectionHead id="home-strategy" title="Strategy at a glance" />
      <div className="hs-grid">
        <article className="card hs-card">
          <span className="eyebrow">This week</span>
          {data.brief ? (
            <>
              <h3>{data.brief.headline}</h3>
              {data.brief.moves.length ? (
                <ol className="hs-list">
                  {data.brief.moves.map((m) => (
                    <li key={m.title}>
                      <b>{m.title}</b>
                      <span className="meta">
                        {" "}
                        · {span(m.on, m.until)}
                        {m.where.length ? ` · ${m.where.slice(0, 2).join(", ")}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="meta">
                  Nothing new starts this week: keep going with what is under way.
                </p>
              )}
            </>
          ) : (
            <p className="meta">No two-week plan covers today yet.</p>
          )}
          <Link to="/plan" className="hs-more">
            The next two weeks →
          </Link>
        </article>

        <article className="card hs-card">
          <span className="eyebrow">Road to election day · {data.daysLeft} days</span>
          {data.phase && (
            <h3>
              {data.phase.title}
              <span className="meta"> · until {shortDay(data.phase.to)}</span>
            </h3>
          )}
          {data.next && (
            <p className="hs-next">
              <b>Next:</b> {data.next.title}, {span(data.next.on, data.next.until ?? data.next.on)}
              {nextIn !== null && nextIn > 0 ? ` (${nextIn} days)` : ""}
              {data.next.sureness !== "confirmed" ? " · not yet set by IEBC" : ""}
            </p>
          )}
          {data.gaps.length > 0 && (
            <ul className="hs-list hs-gaps">
              {data.gaps.map((g) => (
                <li key={g.key} className={`hs-gap hs-gap--${g.tone}`}>
                  {g.headline}
                </li>
              ))}
            </ul>
          )}
          <Link to="/roadmap" className="hs-more">
            The whole road →
          </Link>
        </article>

        <article className="card hs-card">
          <span className="eyebrow">Online now</span>
          {data.spreading.length ? (
            <>
              <h3>
                {data.spreading.length} {data.spreading.length === 1 ? "post" : "posts"} spreading
              </h3>
              <ol className="hs-list">
                {data.spreading.map((p) => (
                  <li key={p.id}>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.title} ↗
                    </a>
                    <span className="meta">
                      {" "}
                      · {sourceName(p.source)} · seen {nf.format(p.reach)}
                      {p.sentiment === "negative" ? " · angry" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="meta">
              Nothing about the race seen {nf.format(data.threshold)}+ times in the last two days.
            </p>
          )}
          {data.reactionsOpen > 0 && (
            <p className="hs-next">
              <b>{data.reactionsOpen}</b> drafted{" "}
              {data.reactionsOpen === 1 ? "reaction" : "reactions"} waiting for a decision.
            </p>
          )}
          <Link to="/listening" className="hs-more">
            Voices, spread and reactions →
          </Link>
        </article>

        {data.impact && (
          <article className="card hs-card">
            <span className="eyebrow">Wider news, read for this seat</span>
            <h3>
              <span className={`pill ${STANCE[data.impact.stance]?.cls ?? "pill--muted"}`}>
                {STANCE[data.impact.stance]?.label ?? data.impact.stance}
              </span>{" "}
              {data.impact.title}
            </h3>
            {data.impact.moves[0] && (
              <p className="meta">
                <b>Do:</b> {data.impact.moves[0]}
              </p>
            )}
            <Link to="/roadmap" hash="news" className="hs-more">
              What it means here →
            </Link>
          </article>
        )}
      </div>
    </section>
  );
}
