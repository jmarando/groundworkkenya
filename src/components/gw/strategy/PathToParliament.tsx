import { useId, useMemo, useState } from "react";

import { Reading, Tile } from "@/components/gw/strategy/PathParts";
import { count, percent } from "@/lib/findings/core";
import {
  flipMpSeat,
  isMpBaseline,
  NO_MP_MOVE,
  runMp,
  type MpPart,
  type MpScenario,
  type MpSeat,
} from "@/lib/mp-path";
import { mpLines } from "@/lib/mp-path-lines";
import { sharePercent } from "@/lib/path-lines";
import { lead, RANGE, signed } from "@/lib/path-view";

function Slider({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: number;
  range: number;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <div className="pth-slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={-range}
        max={range}
        step={1}
        value={value}
        aria-valuetext={`${signed(value, " points")}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{signed(value, " pts")}</output>
    </div>
  );
}

function WardRow({
  p,
  seat,
  move,
  added,
  onMove,
}: {
  p: MpPart;
  seat: MpSeat;
  move: number;
  added: number;
  onMove: (n: number) => void;
}) {
  return (
    <li className="pth-row" data-moved={move !== 0}>
      <div className="pth-head">
        <h3>{p.name}</h3>
        <p className="meta">
          {count(p.registered)} registered · {percent(p.registered / seat.registered)} of the seat
        </p>
      </div>
      <div className="pth-sliders">
        <Slider label="Turnout" value={move} range={RANGE.turnout} onChange={onMove} />
      </div>
      <p className="pth-votes">
        <span className="stat">{signed(added)}</span>
        <span className="meta">voters</span>
      </p>
    </li>
  );
}

/**
 * An MP's (or MCA's) last race: move your side's share of the two main
 * candidates' votes, or a ward's turnout, and see whether the side still has
 * more votes. Worked out in the browser from the atlas's rows; nothing is saved.
 */
export function PathToParliament({ seat }: { seat: MpSeat }) {
  const [flipped, setFlipped] = useState(false);
  const [sc, setSc] = useState<MpScenario>(NO_MP_MOVE);
  const view = useMemo(() => (flipped ? flipMpSeat(seat) : seat), [seat, flipped]);
  const now = useMemo(() => runMp(view, sc), [view, sc]);
  const lines = useMemo(() => mpLines(view, sc), [view, sc]);
  const ahead = lead(now.margin);
  const title = seat.race === "mp" ? "Path to Parliament" : "Path to the County Assembly";
  const pick = (f: boolean) => {
    setFlipped(f);
    setSc(NO_MP_MOVE);
  };

  return (
    <details className="card pth" open>
      <summary>
        <h2>{title}</h2>
        <span className="meta">
          {seat.name}'s {seat.year} {seat.race === "mp" ? "MP" : "MCA"} race
          {seat.parts.length ? ", ward by ward" : ""}
        </span>
      </summary>
      <div className="pth-body">
        <p className="meta pth-intro">
          Start from the {seat.year} result and move your side's share, or a ward's turnout. The
          seat goes to the most votes in one round.
          {seat.defaulted
            ? " Your side isn't set in Elections, so this starts from the winner's."
            : ""}
        </p>
        <div className="pth-side">
          <span className="eyebrow">Start from</span>
          <div className="seg" role="group" aria-label="Start from">
            <button type="button" aria-pressed={!flipped} onClick={() => pick(false)}>
              {seat.yours.name}'s {seat.year} vote
            </button>
            <button type="button" aria-pressed={flipped} onClick={() => pick(true)}>
              {seat.rival.name}'s {seat.year} vote
            </button>
          </div>
        </div>
        <div className="pth-score">
          <Tile
            label={ahead.label}
            value={ahead.text || "—"}
            ok={now.leads}
            sub={
              ahead.label === "Level"
                ? `Level with ${view.rival.name}`
                : `votes ${ahead.label === "Ahead by" ? "over" : "behind"} ${view.rival.name}`
            }
          />
          <Tile
            label="Share of the two"
            value={sharePercent(now.share)}
            ok={null}
            sub={`${seat.year}: ${sharePercent(view.yours.votes / (view.yours.votes + view.rival.votes))}`}
          />
          <Tile
            label="Votes to turn it"
            value={now.leads ? count(now.toTurn) : "—"}
            ok={null}
            sub={now.leads ? "would have to change sides" : "you are not ahead"}
          />
        </div>
        <div className="pth-sliders">
          <Slider
            label="Your share, seat-wide"
            value={sc.share}
            range={RANGE.share}
            onChange={(n) => setSc((s) => ({ ...s, share: n }))}
          />
        </div>
        <ol className="fd-list pth-lines" aria-label="What it says">
          {lines.map((r) => (
            <Reading key={r.id} r={r} />
          ))}
        </ol>
        {seat.parts.length ? (
          <ul className="pth-rows" aria-label="Wards, biggest register first">
            {seat.parts.map((p) => (
              <WardRow
                key={p.key}
                p={p}
                seat={view}
                move={sc.turnout[p.key] ?? 0}
                added={now.added[p.key] ?? 0}
                onMove={(n) => setSc((s) => ({ ...s, turnout: { ...s.turnout, [p.key]: n } }))}
              />
            ))}
          </ul>
        ) : null}
        <div className="pth-foot">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={isMpBaseline(sc)}
            onClick={() => setSc(NO_MP_MOVE)}
          >
            Reset to {seat.year}
          </button>
        </div>
        <details className="pth-fine">
          <summary>How this works</summary>
          <ul>
            <li>
              It starts from the {seat.year} result for the seat as a whole, as the atlas holds it:{" "}
              {seat.source.result}. The register is {seat.source.register}.
            </li>
            <li>
              Results are declared for the seat, not by ward, so nothing here splits the votes by
              ward. A ward's turnout move adds or removes voters in proportion to its register, and
              they split as the seat did. The share here is of the two main candidates' votes
              together; every other candidate is held as they were.
            </li>
            <li>
              The seat goes to the most votes in one round. "Votes to turn it" is half the margin,
              and one.
            </li>
            <li>Wards are places. Nothing here records or guesses anyone's community.</li>
          </ul>
        </details>
      </div>
    </details>
  );
}
