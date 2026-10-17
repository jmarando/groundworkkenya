import { useId, useMemo, useState } from "react";

import { Reading, Tile } from "@/components/gw/strategy/PathParts";
import { count, percent } from "@/lib/findings/core";
import { isBaseline, type Move, type Scenario } from "@/lib/path";
import { sharePercent } from "@/lib/path-lines";
import { lead, RANGE, setMove, signed } from "@/lib/path-view";
import { flipSeat, type Seat } from "@/lib/seat";
import { hallName, seatLines } from "@/lib/seat-lines";
import { runSeat, type BucketNow } from "@/lib/seat-path";

const NO_MOVE: Move = { share: 0, turnout: 0 };

function BucketRow({
  b,
  move,
  onMove,
}: {
  b: BucketNow;
  move: Move;
  onMove: (patch: Partial<Move>) => void;
}) {
  const id = useId();
  const moved = move.share !== 0 || move.turnout !== 0;
  const two = b.was.yours + b.was.rival;
  return (
    <li className="pth-row" data-moved={moved}>
      <div className="pth-head">
        <h3>{b.name}</h3>
        <p className="meta">
          {b.together ? `${b.seats} seats together · ` : ""}
          {count(two)} votes between the two main candidates
        </p>
      </div>
      <p className="pth-shares">
        <span>
          <span className="meta">Your side</span> {sharePercent(b.was.share)} →{" "}
          <strong className="stat">{sharePercent(b.share)}</strong>
        </span>
        <span className="meta">
          The two took {percent(b.was.turnout)} of the register
          {move.turnout !== 0 ? ` → ${percent(b.turnout)}` : ""}
        </span>
      </p>
      <div className="pth-sliders">
        <div className="pth-slider">
          <label htmlFor={`${id}-share`}>Share</label>
          <input
            id={`${id}-share`}
            type="range"
            min={-RANGE.share}
            max={RANGE.share}
            step={1}
            value={move.share}
            aria-valuetext={`${signed(move.share, " points")} of share`}
            onChange={(e) => onMove({ share: Number(e.target.value) })}
          />
          <output htmlFor={`${id}-share`}>{signed(move.share, " pts")}</output>
        </div>
        <div className="pth-slider">
          <label htmlFor={`${id}-turnout`}>Turnout</label>
          <input
            id={`${id}-turnout`}
            type="range"
            min={-RANGE.turnout}
            max={RANGE.turnout}
            step={1}
            value={move.turnout}
            aria-valuetext={`${signed(move.turnout, " points")} of turnout`}
            onChange={(e) => onMove({ turnout: Number(e.target.value) })}
          />
          <output htmlFor={`${id}-turnout`}>{signed(move.turnout, " pts")}</output>
        </div>
      </div>
      <p className="pth-votes">
        <span className="stat">{signed(b.margin)}</span>
        <span className="meta">
          votes of margin{moved ? ` (2022: ${signed(b.was.margin)})` : ""}
        </span>
      </p>
    </li>
  );
}

/**
 * A governor's 2022 race, constituency by constituency: change a constituency's
 * share or turnout and see whether the side still has more votes than anyone
 * else. Worked out in the browser from the atlas's rows; nothing is saved.
 */
export function PathToCityHall({ seat }: { seat: Seat }) {
  const [flipped, setFlipped] = useState(false);
  const [moves, setMoves] = useState<Scenario>({});
  const view = useMemo(() => (flipped ? flipSeat(seat) : seat), [seat, flipped]);
  const now = useMemo(() => runSeat(view, moves), [view, moves]);
  const lines = useMemo(() => seatLines(view, moves), [view, moves]);
  const t = now.totals;
  const ahead = lead(t.margin);
  const together = t.together ? lead(t.together.margin) : null;
  // "+5" means the opposite for the other side, so changing side starts again.
  const pick = (f: boolean) => {
    setFlipped(f);
    setMoves({});
  };
  const rows = [...now.buckets].sort(
    (a, b) =>
      b.was.yours + b.was.rival - (a.was.yours + a.was.rival) || a.name.localeCompare(b.name),
  );

  return (
    <details className="card pth" open>
      <summary>
        <h2>Path to {hallName(seat.countyName)}</h2>
        <span className="meta">The 2022 governor race, constituency by constituency</span>
      </summary>
      <div className="pth-body">
        <p className="meta pth-intro">
          Start from the 2022 result in each constituency and change one's share or turnout. A
          governor is elected in one round by the most votes.
          {seat.defaulted
            ? " Your side isn't set in Elections, so this starts from the winner's."
            : ""}
        </p>
        <div className="pth-side">
          <span className="eyebrow">Start from</span>
          <div className="seg" role="group" aria-label="Start from">
            <button type="button" aria-pressed={!flipped} onClick={() => pick(false)}>
              {seat.yours.name}'s 2022 vote
            </button>
            <button type="button" aria-pressed={flipped} onClick={() => pick(true)}>
              {seat.rival.name}'s 2022 vote
            </button>
          </div>
        </div>
        <div className="pth-score">
          <Tile
            label={ahead.label}
            value={ahead.text || "—"}
            ok={t.leads}
            sub={
              ahead.label === "Level"
                ? `Level with ${view.rival.name}`
                : `votes ${ahead.label === "Ahead by" ? "over" : "behind"} ${view.rival.name}`
            }
          />
          <Tile
            label="Constituencies carried"
            value={`${t.carried} of ${t.reported}`}
            ok={null}
            sub={
              t.together && together
                ? `plus the ${t.together.seats} ${t.together.seats === 1 ? "seat" : "seats"} reported together: ${
                    together.label === "Level"
                      ? "level"
                      : `${together.label.toLowerCase()} ${together.text}`
                  }`
                : "reported separately"
            }
          />
          <Tile
            label="Votes to turn the county"
            value={count(t.toTurn)}
            ok={null}
            sub="would have to change sides"
          />
        </div>
        <ol className="fd-list pth-lines" aria-label="What it says">
          {lines.map((r) => (
            <Reading key={r.id} r={r} />
          ))}
        </ol>
        <ul className="pth-rows" aria-label="Constituencies, biggest first">
          {rows.map((b) => (
            <BucketRow
              key={b.key}
              b={b}
              move={moves[b.key] ?? NO_MOVE}
              onMove={(patch) => setMoves((m) => setMove(m, b.key, patch))}
            />
          ))}
        </ul>
        <div className="pth-foot">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={isBaseline(moves)}
            onClick={() => setMoves({})}
          >
            Reset to 2022
          </button>
        </div>
        <details className="pth-fine">
          <summary>How this works</summary>
          <ul>
            <li>
              It starts from the 2022 governor result in each constituency as the atlas holds it:{" "}
              {seat.source.constituencies}; the county's totals are {seat.source.county}.
              {now.buckets.some((b) => b.together)
                ? " Seats the figures don't separate are shown together: the county's total less the constituencies reported."
                : ""}
            </li>
            <li>
              The atlas holds the two main candidates' votes and the register for a constituency,
              nothing more. So a share here is a candidate's share of the two together, and turnout
              is the two together over the register. A share move changes one constituency by that
              many points; turnout adds or removes voters who split as the constituency does. Every
              other candidate ({count(seat.others)} votes) is held as they were.
            </li>
            <li>
              A governor is elected in one round by the most votes: there is no second bar. "Votes
              to turn the county" is half the margin, and one.
            </li>
            <li>Constituencies are places. Nothing here records or guesses anyone's community.</li>
          </ul>
        </details>
      </div>
    </details>
  );
}

/** What a governor campaign sees when its county's result isn't in the atlas by constituency. */
export function NoPathToCityHall({ place, why }: { place: string; why: string }) {
  return (
    <section className="card pth" aria-labelledby="pch-none">
      <h2 id="pch-none">Path to {hallName(place)}</h2>
      <p className="f-note">{why}</p>
      <p className="f-note">
        It needs the 2022 governor result for each constituency of the county. Once that is in the
        atlas this section opens by itself.
      </p>
    </section>
  );
}
