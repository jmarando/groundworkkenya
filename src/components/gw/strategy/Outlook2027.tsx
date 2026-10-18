import { useId, useMemo, useState } from "react";

import { OutlookNotes } from "@/components/gw/strategy/OutlookNotes";
import { Reading, Tile } from "@/components/gw/strategy/PathParts";
import { count, percent } from "@/lib/findings/core";
import {
  addCandidate,
  baselinePlan,
  DEFAULT_NAMES,
  dropCandidate,
  isBaseline,
  likeBefore,
  SLOTS,
  simulate,
  splitPool,
  withBack,
  withGoes,
  type BucketOutcome,
  type Plan,
  type PoolId,
  type Take,
  type Youth,
} from "@/lib/outlook";
import { NAIROBI_NOTES, outlookLines, SENATE_NOTE } from "@/lib/outlook-lines";
import type { Note } from "@/lib/outlook-notes";
import { outlookFor } from "@/lib/outlook-youth";
import { sharePercent } from "@/lib/path-lines";
import { lead } from "@/lib/path-view";
import { flipSeat, type Seat } from "@/lib/seat";
import { hallName } from "@/lib/seat-lines";

/** The readings about the plan, and the ones from 2022's votes and the estimates. */
const PLAN_IDS = [
  "standing",
  "turn",
  "united",
  "closest",
  "idle",
  "idle-plan",
  "fresh",
  "fresh-plan",
];
const FACT_IDS = ["ceiling", "ticket", "young"];

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const whole = (x: number) => count(Math.round(x));
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-03-30 to 2026-04-28" as "30 March to 28 April 2026"; anything else as it is. */
function spanText(period: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) to (\d{4})-(\d{2})-(\d{2})$/.exec(period);
  if (!m) return period;
  const day = (d: string, mo: string, y: string) =>
    `${Number(d)} ${MONTHS[Number(mo) - 1] ?? ""} ${y}`;
  const from = day(m[3]!, m[2]!, m[1]!);
  return `${m[1] === m[4] ? from.replace(` ${m[1]}`, "") : from} to ${day(m[6]!, m[5]!, m[4]!)}`;
}

/** A slider that sets a number of points, with its label and what it reads. */
function Points({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  const id = useId();
  const shown = Math.round(value);
  return (
    <div className="out-slider">
      <label htmlFor={id} title={label}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={shown}
        aria-valuetext={`${shown} percent ${unit}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{shown}%</output>
    </div>
  );
}

/** One group of voters: how many vote, and for whom. */
function Group({
  title,
  sub,
  backLabel,
  take,
  names,
  onBack,
  onGoes,
}: {
  title: string;
  sub: string;
  backLabel: string;
  take: Take;
  names: string[];
  onBack: (v: number) => void;
  onGoes: (slot: number, v: number) => void;
}) {
  const left = Math.max(0, 100 - sum(take.goes.slice(0, names.length)));
  return (
    <section className="card out-group">
      <div className="pth-head">
        <h3>{title}</h3>
        <p className="meta">{sub}</p>
      </div>
      <Points label={backLabel} value={take.back} onChange={onBack} unit="of the group vote" />
      <p className="meta out-goes">Of those who vote, for</p>
      {names.map((n, i) => (
        <Points
          key={i}
          label={n}
          value={take.goes[i] ?? 0}
          onChange={(v) => onGoes(i, v)}
          unit="of those who vote"
        />
      ))}
      <p className="meta out-else">
        Everyone else <strong className="stat">{Math.round(left)}%</strong>
      </p>
    </section>
  );
}

/** Who has the most votes in a place and by how many whole votes; none when it is level. */
function leader(votes: number[]): { slot: number | null; by: number } {
  const order = votes.map((_, i) => i).sort((a, b) => votes[b]! - votes[a]! || a - b);
  const by = Math.round(votes[order[0]!]! - (votes[order[1]!] ?? 0));
  return by > 0 ? { slot: order[0]!, by } : { slot: null, by: 0 };
}

function Place({ b, names, youth }: { b: BucketOutcome; names: string[]; youth: Youth | null }) {
  const l = leader(b.votes);
  const facts = youth?.buckets[b.key];
  return (
    <li className="out-place" data-moved={b.fresh > 0 ? "true" : undefined}>
      <div className="pth-head">
        <h3>{b.name}</h3>
        <p className="meta">
          {b.together ? `${b.seats} seats together · ` : ""}
          {count(b.registered)} on the 2022 register
        </p>
      </div>
      <p className="out-lead">
        <span className="stat">{l.slot === null ? "Level" : whole(l.by)}</span>
        <span className="meta">{l.slot === null ? "" : `${names[l.slot]} ahead`}</span>
      </p>
      <p className="meta out-extra">
        {[
          b.idle >= 0.5 ? `${whole(b.idle)} on the register cast no valid vote in 2022` : "",
          b.fresh > 0 ? `${count(b.fresh)} new registrations placed here` : "",
          facts && facts.adults > 0
            ? `${percent(facts.young / facts.adults)} of adults are young`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}

/**
 * Looking ahead to 2027 for a governor's race: who is in the field and where each
 * group of 2022 voters goes (and the county's new registrations), constituency by
 * constituency, worked out in the browser from the atlas's rows; nothing is saved.
 * These are situations to try, not forecasts.
 */
export function Outlook2027({
  seat,
  youth,
  registration,
  notes,
  candidate,
}: {
  seat: Seat;
  youth: Youth | null;
  registration: { count: number; period: string; source: string } | null;
  notes: Note[];
  candidate: string | null;
}) {
  const [flipped, setFlipped] = useState(false);
  const view = useMemo(() => (flipped ? flipSeat(seat) : seat), [seat, flipped]);
  const [plan, setPlan] = useState<Plan>(() => baselinePlan(seat, [candidate ?? ""]));
  // A name left blank is the default one.
  const named = useMemo<Plan>(
    () => ({ ...plan, names: plan.names.map((n, i) => n.trim() || DEFAULT_NAMES[i]!) }),
    [plan],
  );
  const o = useMemo(() => outlookFor(view, youth, registration), [view, youth, registration]);
  const r = useMemo(() => simulate(o, named), [o, named]);
  const lines = useMemo(() => outlookLines(o, named), [o, named]);
  const base = isBaseline(named, view);
  const ahead = lead(r.margin);
  const names = r.names;
  const rival = names[r.rival]!;
  const hall = hallName(seat.countyName);
  const nairobi = seat.countyName === "Nairobi";

  const pick = (f: boolean) => {
    setFlipped(f);
    setPlan((p) => baselinePlan(f ? flipSeat(seat) : seat, p.names));
  };
  const reset = () => setPlan((p) => baselinePlan(view, p.names.slice(0, 2)));
  const rename = (i: number, name: string) =>
    setPlan((p) => ({ ...p, names: p.names.map((n, j) => (j === i ? name : n)) }));
  const back = (pool: PoolId) => (v: number) => setPlan((p) => withBack(p, pool, v));
  const goes = (pool: PoolId) => (slot: number, v: number) =>
    setPlan((p) => withGoes(p, pool, slot, v));

  const order = r.votes.map((_, i) => i).sort((a, b) => r.votes[b]! - r.votes[a]! || a - b);
  const size = new Map(view.buckets.map((b) => [b.key, b.yours + b.rival]));
  const rows = [...r.buckets].sort(
    (a, b) => size.get(b.key)! - size.get(a.key)! || a.name.localeCompare(b.name),
  );
  const planLines = lines.filter((l) => PLAN_IDS.includes(l.id));
  const factLines = lines.filter((l) => FACT_IDS.includes(l.id));
  const stayed = r.buckets.reduce((t, b) => t + b.idle, 0);
  const pools: { id: PoolId; name: string; sub: string; label: string }[] = [
    {
      id: "yours",
      name: `${view.yours.name}'s 2022 voters`,
      sub: `${count(view.total.yours)} votes in ${seat.countyName}, 2022`,
      label: "Votes again",
    },
    {
      id: "rival",
      name: `${view.rival.name}'s 2022 voters`,
      sub: `${count(view.total.rival)} votes in ${seat.countyName}, 2022`,
      label: "Votes again",
    },
    {
      id: "idle",
      name: "On the 2022 register, no valid vote",
      sub: `${whole(stayed)} in ${seat.countyName}`,
      label: "Vote",
    },
  ];

  return (
    <details className="card pth out" open>
      <summary>
        <h2>Outlook 2027</h2>
        <span className="meta">
          Who is in the field for {hall}, and where each group of 2022 voters goes
        </span>
      </summary>
      <div className="pth-body">
        <p className="meta pth-intro">
          Your candidate starts with the 2022 voters of one of the two main candidates. Name the
          others in the field, say how many of each group of 2022 voters vote again and for whom,
          and see who has the most votes: a governor is elected in one round by the most votes.
          These are situations to try, not forecasts.
          {seat.defaulted && !flipped
            ? " Your side isn't set in Elections, so this starts from the winner's."
            : ""}
        </p>

        <OutlookNotes notes={notes} county={seat.countyName} />

        <div className="pth-side">
          <span className="eyebrow">Your candidate starts with</span>
          <div className="seg" role="group" aria-label="Your candidate starts with">
            <button type="button" aria-pressed={!flipped} onClick={() => pick(false)}>
              {seat.yours.name}'s 2022 voters
            </button>
            <button type="button" aria-pressed={flipped} onClick={() => pick(true)}>
              {seat.rival.name}'s 2022 voters
            </button>
          </div>
        </div>

        <section className="out-block" aria-label="The field">
          <h3>The field</h3>
          <div className="out-names">
            {plan.names.map((n, i) => (
              <div key={i} className="out-name">
                <label>
                  <span>{i === 0 ? "Your candidate" : `Candidate ${i + 1}`}</span>
                  <input
                    type="text"
                    value={n}
                    maxLength={32}
                    placeholder={DEFAULT_NAMES[i]}
                    onChange={(e) => rename(i, e.target.value)}
                  />
                </label>
                {i >= 2 ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPlan((p) => dropCandidate(p, i))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {plan.names.length < SLOTS ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm out-add"
                onClick={() => setPlan((p) => addCandidate(p))}
              >
                Add a candidate
              </button>
            ) : null}
          </div>
        </section>

        <section className="out-block" aria-label="Situations to try">
          <h3>Situations to try</h3>
          <div className="out-presets">
            <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
              2022 again
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPlan((p) => splitPool(p, "rival"))}
            >
              {view.rival.name}'s 2022 voters shared between two candidates
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPlan((p) => splitPool(p, "yours"))}
            >
              {view.yours.name}'s 2022 voters shared between two candidates
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPlan((p) => withBack(p, "idle", 10))}
            >
              A tenth of those with no valid vote in 2022 vote
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!o.fresh}
              onClick={() => setPlan((p) => likeBefore(p, view))}
            >
              New registrations vote as the 2022 register did
            </button>
          </div>
        </section>

        <div className="pth-score" aria-live="polite" aria-atomic="true">
          <Tile
            label={ahead.label}
            value={ahead.text || "—"}
            ok={r.leads}
            sub={
              ahead.label === "Level"
                ? `Level with ${rival}`
                : `votes ${ahead.label === "Ahead by" ? "over" : "behind"} ${rival}`
            }
          />
          <Tile
            label={names[0]!}
            value={whole(r.votes[0]!)}
            ok={null}
            sub={`${sharePercent(r.shares[0]!)} of the valid votes`}
          />
          <Tile
            label="Votes to turn it"
            value={count(r.toTurn)}
            ok={null}
            sub="would have to change sides"
          />
        </div>

        <ul className="out-results" aria-label="Votes by candidate">
          {order.map((i) => (
            <li key={i}>
              <span className="out-who">{names[i]}</span>
              <span className="stat">{whole(r.votes[i]!)}</span>
              <span className="meta">{sharePercent(r.shares[i]!)}</span>
              <span className="out-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, r.shares[i]! * 100)}%` }} />
              </span>
            </li>
          ))}
          {r.everyone > 0.5 ? (
            <li>
              <span className="out-who">Everyone else</span>
              <span className="stat">{whole(r.everyone)}</span>
              <span className="meta">{sharePercent(r.everyone / r.valid)}</span>
              <span className="out-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (r.everyone / r.valid) * 100)}%` }} />
              </span>
            </li>
          ) : null}
        </ul>

        <ol className="fd-list pth-lines" aria-label="What it says">
          {planLines.map((l) => (
            <Reading key={l.id} r={l} />
          ))}
        </ol>

        <section className="out-block" aria-label="Where each group of 2022 voters goes">
          <h3>Where each group of 2022 voters goes</h3>
          <div className="out-groups">
            {pools.map((p) => (
              <Group
                key={p.id}
                title={p.name}
                sub={p.sub}
                backLabel={p.label}
                take={plan.takes[p.id]}
                names={names}
                onBack={back(p.id)}
                onGoes={goes(p.id)}
              />
            ))}
            {o.fresh && registration ? (
              <Group
                title="New registrations"
                sub={`${count(registration.count)} in ${seat.countyName}, ${spanText(registration.period)}`}
                backLabel="Vote"
                take={plan.takes.new}
                names={names}
                onBack={back("new")}
                onGoes={goes("new")}
              />
            ) : (
              <section className="card out-group">
                <div className="pth-head">
                  <h3>New registrations</h3>
                </div>
                <p className="f-note">
                  {registration
                    ? `${seat.countyName}'s new registrations can't be placed in its constituencies without population estimates, so they aren't counted.`
                    : `${seat.countyName}'s new registrations aren't on file (the IEBC's figures printed so far cover 17 counties), so they aren't counted.`}
                </p>
              </section>
            )}
          </div>
        </section>

        <section className="out-block" aria-label="Where each candidate's votes come from">
          <h3>Where each candidate's votes come from</h3>
          <ul className="out-from">
            {order.map((i) => (
              <li key={i}>
                <span className="out-who">{names[i]}</span>
                <span className="stat">{whole(r.votes[i]!)}</span>
                <span className="meta out-sources">
                  {[
                    [`${view.yours.name}'s 2022 voters`, r.from.yours[i]!],
                    [`${view.rival.name}'s 2022 voters`, r.from.rival[i]!],
                    ["people with no valid vote in 2022", r.from.idle[i]!],
                    ["new registrations", r.from.new[i]!],
                  ]
                    .filter(([, v]) => Math.round(v as number) > 0)
                    .map(([label, v]) => `${whole(v as number)} from ${label}`)
                    .join(" · ") || "no votes"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="out-block out-facts"
          aria-label={
            nairobi ? "Looking at the Nairobi picture" : "From 2022's votes and the estimates"
          }
        >
          <h3>
            {nairobi ? "Looking at the Nairobi picture" : "From 2022's votes and the estimates"}
          </h3>
          {nairobi ? <p className="out-senate">{SENATE_NOTE}</p> : null}
          <ol className="fd-list pth-lines">
            {factLines.map((l) => (
              <Reading key={l.id} r={l} />
            ))}
          </ol>
          {nairobi ? (
            <ul className="out-points">
              {NAIROBI_NOTES.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="out-block" aria-label="The constituencies">
          <h3>The constituencies, biggest first</h3>
          <ul className="out-places">
            {rows.map((b) => (
              <Place key={b.key} b={b} names={names} youth={youth} />
            ))}
          </ul>
        </section>

        <div className="pth-foot">
          <button type="button" className="btn btn--ghost btn--sm" disabled={base} onClick={reset}>
            Reset to 2022
          </button>
        </div>

        <details className="pth-fine">
          <summary>How this works</summary>
          <ul>
            <li>
              A group is the voters one of the two main candidates had in a place in 2022, or the
              people newly on the register. Nothing here records, guesses or models any person's or
              community's vote; the shares you set are the situations you want to try.
            </li>
            <li>
              It starts from the 2022 governor result in each constituency as the atlas holds it:{" "}
              {seat.source.constituencies}; the county's totals are {seat.source.county}. The atlas
              holds the two main candidates' votes in a constituency, so that is what the groups
              are. The other candidates' {count(seat.others)} votes stay with "everyone else". Seats
              the figures don't separate are shown together.
            </li>
            <li>
              "Votes again" is the share of a group who vote in 2027; the rest stay at home. Of
              those who vote, you say how many vote for each candidate in the field; what is left
              votes for someone else. Moving a candidate's share takes the votes from the group's
              own candidate first and gives them back when it is lowered. The same shares apply in
              every constituency, so read the table as a starting point.
            </li>
            <li>
              People with no valid vote in 2022 are those on the 2022 register who did not cast one:
              the register less the valid votes, placed in each constituency by its register less
              its votes (the other candidates' votes are scaled by the two main candidates'). They
              stay at home unless you move "Vote". Where they are is place context, a guide to where
              turnout could grow; nothing says who they are or how they would vote.
            </li>
            <li>
              New registrations are the IEBC's figure for the county in its mass drive (
              {registration ? spanText(registration.period) : "30 March to 28 April 2026"}): gross,
              unaudited, with no age breakdown published. The IEBC publishes by county, so they are
              placed in constituencies in proportion to the adults an estimate for 2020 puts off the
              2022 register (never below zero, so none where the register is already longer than the
              estimate). That is a guide to where the unregistered are, not a count of where people
              registered.
            </li>
            <li>
              The readings say what would have to be true; none is a forecast. Polls are in the
              notes for context and are not used in the sums.
            </li>
            <li>Nothing here is saved.</li>
          </ul>
        </details>
      </div>
    </details>
  );
}
