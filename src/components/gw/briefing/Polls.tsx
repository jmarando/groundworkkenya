import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ShareBar } from "@/components/gw/demo/charts";
import { ours } from "@/lib/demo";
import { turnoutWhatIf } from "@/lib/demo/insights";
import type { Scenario } from "@/lib/demo/types";

const nf = new Intl.NumberFormat("en-KE");

/** Our latest poll, the breakdowns worth knowing, other polls, and what to ask next. */
export function Polls({ s }: { s: Scenario }) {
  const p = s.polls;
  const parts = [
    ...s.contenders.map((c) => ({
      key: c.key,
      label: c.short,
      value: p.own.shares[c.key] ?? 0,
      tone: c.tone,
    })),
    {
      key: "undecided",
      label: "Undecided",
      value: p.own.shares["undecided"] ?? 0,
      tone: "und" as const,
    },
  ];
  const us = ours(s);
  const rival = s.contenders[1]!;
  return (
    <section className="card mb-polls" aria-labelledby="mb-polls-h">
      <div className="card-head">
        <h2 id="mb-polls-h">Polls</h2>
        <Link to="/polling" className="btn btn--ghost btn--sm">
          All polls
        </Link>
      </div>
      <p className="mb-label">
        Our poll · {p.own.date} · {nf.format(p.own.n)} people · ±{p.own.moe} points
      </p>
      <p className="mb-poll-q">“{p.own.question}”</p>
      <ShareBar parts={parts} label={`${p.own.question} Results`} />
      <p className="mb-note">
        {p.own.method}. The lead is{" "}
        {Math.abs((p.own.shares[us.key] ?? 0) - (p.own.shares[rival.key] ?? 0))} points; the margin
        of error on the gap is about ±{(p.own.moe * 2).toFixed(1)}.
      </p>

      <p className="mb-label">Worth knowing</p>
      <table className="tbl mb-cross">
        <thead>
          <tr>
            <th>Group</th>
            <th style={{ textAlign: "right" }}>{us.short}</th>
            <th style={{ textAlign: "right" }}>{rival.short}</th>
            <th>What it means</th>
          </tr>
        </thead>
        <tbody>
          {p.crosstabs.map((c) => (
            <tr key={c.group}>
              <td>
                <b>{c.group}</b>
              </td>
              <td className="num">{c.us}%</td>
              <td className="num">{c.rival}%</td>
              <td className="meta">{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mb-label">Other polls</p>
      <ul className="mb-outside">
        {p.outside.map((o) => (
          <li key={o.pollster + o.date}>
            <b>{o.pollster}</b>{" "}
            <span className="dim">
              {o.date} · {nf.format(o.n)} people
            </span>
            <span className="mb-outside-v">
              {s.contenders.map((c) => `${c.short} ${o.shares[c.key] ?? 0}`).join(" · ")} ·
              undecided {o.shares["undecided"] ?? 0}
            </span>
          </li>
        ))}
      </ul>

      <div className="mb-ask">
        <p className="mb-label">Ask voters today</p>
        <ul>
          {p.ideas.map((q) => (
            <li key={q}>
              <Link to="/polling" search={{ ask: q }} className="mb-ask-q">
                {q}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mb-note">
          Opens the poll builder with the question filled in. Nothing is sent until you launch it.
        </p>
      </div>
    </section>
  );
}

/** The last election for this seat, what it teaches, and what turnout is worth now. */
export function LastTime({ s }: { s: Scenario }) {
  const lt = s.lastTime;
  const [lift, setLift] = useState(3);
  const us = ours(s);
  const whatIf = useMemo(
    () =>
      turnoutWhatIf(
        s.areas,
        s.contenders.map((c) => c.key),
        us.key,
        lift,
      ),
    [s, us.key, lift],
  );
  const before = whatIf.before[us.key] ?? 0;
  const after = whatIf.after[us.key] ?? 0;
  const top = Math.max(...lt.results.map((r) => r.votes));
  const total = lt.results.reduce((t, r) => t + r.votes, 0);
  const strongholds = s.areas.filter((a) => (a.shares[us.key] ?? 0) >= 50).length;

  return (
    <section className="card mb-last" aria-labelledby="mb-last-h">
      <div className="card-head">
        <h2 id="mb-last-h">Last time</h2>
        <span className={`mb-src ${lt.official ? "is-official" : ""}`}>
          {lt.official ? "IEBC official" : "Illustrative"}
        </span>
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
      <ul className="mb-lessons">
        {lt.lessons.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <div className="mb-whatif">
        <label htmlFor={`lift-${s.key}`} className="mb-label">
          What if turnout rose in your {strongholds} strongest {s.geo.units}?
        </label>
        <div className="mb-whatif-row">
          <input
            id={`lift-${s.key}`}
            type="range"
            min={0}
            max={8}
            step={1}
            value={lift}
            onChange={(e) => setLift(Number(e.target.value))}
          />
          <b>+{lift} points</b>
        </div>
        <p className="mb-whatif-out">
          <b>+{nf.format(Math.round(whatIf.extraVotes))}</b> votes for {us.short}; share{" "}
          {before.toFixed(1)}% → <b>{after.toFixed(1)}%</b>
          {s.office === "president" && (
            <> · {after > 50 ? "over the 50% line" : `${(50 - after).toFixed(1)} short of 50%`}</>
          )}
        </p>
      </div>
    </section>
  );
}
