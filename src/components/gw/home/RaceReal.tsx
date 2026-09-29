import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { PollChart } from "@/components/gw/home/PollChart";
import type { Scenario } from "@/lib/demo/types";
import type { IssueLine, RaceView } from "@/lib/home";
import { byRecency, fieldworkLabel, pollChart, pollLabel, shareOf } from "@/lib/race-data";

const nf = new Intl.NumberFormat("en-KE");

/** The race as it stands: published polls, who's running, what people say, last time. */
export function RaceReal({
  s,
  race,
  canEdit,
  onEdit,
  onRemovePoll,
}: {
  s: Scenario;
  race: RaceView;
  canEdit: boolean;
  onEdit: (what: "rivals" | "poll") => void;
  onRemovePoll: (id: string) => void;
}) {
  return (
    <>
      <PollsCard
        race={race}
        canEdit={canEdit}
        onAdd={() => onEdit("poll")}
        onRemove={onRemovePoll}
      />
      <div className="mb-two">
        <RivalsCard race={race} canEdit={canEdit} onEdit={() => onEdit("rivals")} />
        <SayingCard issues={race.issues} />
      </div>
      {s.lastTime.official ? <OfficialResult s={s} /> : null}
    </>
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm home-remove${sure ? " is-sure" : ""}`}
      aria-label={sure ? `Yes, remove ${label}` : `Remove ${label}`}
      onClick={() => (sure ? onRemove() : setSure(true))}
      onBlur={() => setSure(false)}
    >
      {sure ? "Remove?" : "×"}
    </button>
  );
}

function PollsCard({
  race,
  canEdit,
  onAdd,
  onRemove,
}: {
  race: RaceView;
  canEdit: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const model = useMemo(() => pollChart(race.rivals, race.polls), [race]);
  const newest = [...race.polls].sort(byRecency);
  const columns = race.rivals.filter((r) => model.series.some((c) => c.key === r.id));
  return (
    <section className="card home-polls" aria-labelledby="home-polls-h">
      <div className="card-head">
        <div>
          <h2 id="home-polls-h">Polls over time</h2>
          <p className="meta">
            {newest.length
              ? `${newest.length} published ${newest.length === 1 ? "poll" : "polls"}; the latest is ${pollLabel(newest[0]!)}.`
              : "No polls on record yet."}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onAdd}>
            Add a poll
          </button>
        )}
      </div>
      {columns.length > 0 && <PollChart model={model} />}
      {newest.length > 0 && columns.length === 0 && (
        <p className="meta">Add the candidates with Edit rivals to chart these polls.</p>
      )}
      {newest.length > 0 && (
        <div className="tblwrap">
          <table className="tbl home-poll-tbl">
            <thead>
              <tr>
                <th>Poll</th>
                {columns.map((r) => (
                  <th key={r.id} style={{ textAlign: "right" }}>
                    {r.name}
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>Undecided</th>
                <th>Source</th>
                {canEdit && (
                  <th>
                    <span className="sr-only">Remove</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {newest.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.pollster}</b>
                    <small className="dim">
                      {fieldworkLabel(p)}
                      {p.sampleSize ? ` · ${nf.format(p.sampleSize)} people` : ""}
                      {p.margin ? ` · ±${p.margin}` : ""}
                    </small>
                  </td>
                  {columns.map((r) => {
                    const v = shareOf(p, r);
                    return (
                      <td key={r.id} className="num">
                        {v === null ? "–" : `${v}%`}
                      </td>
                    );
                  })}
                  <td className="num">{p.undecided === null ? "–" : `${p.undecided}%`}</td>
                  <td>
                    <a
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Source: ${pollLabel(p)}`}
                    >
                      Source ›
                    </a>
                  </td>
                  {canEdit && (
                    <td>
                      <RemoveButton label={pollLabel(p)} onRemove={() => onRemove(p.id)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RivalsCard({
  race,
  canEdit,
  onEdit,
}: {
  race: RaceView;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const newest = [...race.polls].sort(byRecency);
  return (
    <section className="card home-rivals" aria-labelledby="home-rivals-h">
      <div className="card-head">
        <h2 id="home-rivals-h">Who&apos;s running</h2>
        {canEdit && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>
            Edit rivals
          </button>
        )}
      </div>
      {race.rivals.length ? (
        <ul className="home-rival-list">
          {race.rivals.map((r) => {
            const p = newest.find((x) => shareOf(x, r) !== null);
            return (
              <li key={r.id}>
                <span className={`mb-swatch mb-swatch--${r.tone}`} aria-hidden="true" />
                <div>
                  <b>{r.name}</b>
                  {r.isUs ? <span className="dim"> · yours</span> : null}
                  <small className="dim">
                    {[r.party, r.office].filter(Boolean).join(" · ") || "Party not recorded"}
                  </small>
                </div>
                <span className="home-rival-share">
                  {p ? (
                    <>
                      <b>{shareOf(p, r)}%</b>
                      <small className="dim">{pollLabel(p)}</small>
                    </>
                  ) : (
                    <small className="dim">In no poll yet</small>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="meta">No candidates on record yet.</p>
      )}
    </section>
  );
}

function SayingCard({ issues }: { issues: IssueLine[] }) {
  return (
    <section className="card home-saying" aria-labelledby="home-saying-h">
      <div className="card-head">
        <div>
          <h2 id="home-saying-h">What people are saying</h2>
          <p className="meta">News and social posts from Listening, last 30 days.</p>
        </div>
      </div>
      {issues.length ? (
        <ol className="home-issues">
          {issues.map((i) => (
            <li key={i.key}>
              <div className="home-issue-head">
                <Link to="/listening" search={{ issue: i.key }}>
                  <b>{i.label}</b>
                </Link>
                <span className="dim">
                  {nf.format(i.count)} {i.count === 1 ? "mention" : "mentions"}
                  {i.angry ? `, ${nf.format(i.angry)} angry` : ""}
                </span>
              </div>
              {i.examples.map((e) => (
                <p key={e.text} className="home-issue-line">
                  {e.url ? (
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
          Nothing picked up in the last 30 days.{" "}
          <Link to="/listening">Add keywords in Listening</Link>.
        </p>
      )}
    </section>
  );
}

/** The last election's official result; the sample's lessons and what-if stay out. */
function OfficialResult({ s }: { s: Scenario }) {
  const lt = s.lastTime;
  const top = Math.max(...lt.results.map((r) => r.votes));
  const total = lt.results.reduce((t, r) => t + r.votes, 0);
  return (
    <section className="card mb-last" aria-labelledby="home-last-h">
      <div className="card-head">
        <h2 id="home-last-h">Last time</h2>
        <span className="mb-src is-official">IEBC official</span>
      </div>
      <p className="mb-label">{lt.title}</p>
      <ul className="mb-results">
        {lt.results.map((r) => (
          <li key={r.name}>
            <span className="mb-results-n">{r.name}</span>
            <span className="mb-results-bar" aria-hidden="true">
              <i style={{ width: `${(r.votes / top) * 100}%` }} />
            </span>
            <b>{nf.format(r.votes)}</b>
            <small className="dim">
              {r.share !== undefined
                ? `${r.share}%`
                : `${((r.votes / total) * 100).toFixed(1)}% of top two`}
            </small>
          </li>
        ))}
      </ul>
      <p className="mb-note">
        {lt.turnout !== null ? `Turnout ${Math.round(lt.turnout * 1000) / 10}%. ` : ""}
        {lt.source}.
      </p>
    </section>
  );
}
