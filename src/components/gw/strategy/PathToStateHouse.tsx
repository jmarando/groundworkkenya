import { Fragment, useId, useMemo, useState } from "react";

import { count, percent } from "@/lib/findings/core";
import { kenya } from "@/lib/kenya-data";
import {
  atLine,
  isBaseline,
  RULE,
  runPath,
  SIDES,
  type CountyNow,
  type Move,
  type RegionNow,
  type Scenario,
  type Side,
} from "@/lib/path";
import { pathLines, sharePercent, type PathLine } from "@/lib/path-lines";
import { bySize, lead, RANGE, setMove, signed } from "@/lib/path-view";

const NO_MOVE: Move = { share: 0, turnout: 0 };

/** One reading, with its figures and sources on request, as the findings have. */
function Reading({ r }: { r: PathLine }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="fd-item">
      <div className="fd-body">
        <p className="fd-line">{r.line}</p>
        <div className="fd-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            Figures and sources
          </button>
        </div>
        {open ? (
          <dl className="fd-figs">
            {r.figures.map((x, i) => (
              <Fragment key={i}>
                <dt>{x.label}</dt>
                <dd>
                  {x.text}{" "}
                  <span className="meta">
                    {x.source} · {x.period}
                  </span>
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  );
}

function Tile({
  label,
  value,
  sub,
  ok,
}: {
  label: string;
  value: string;
  sub: string;
  /** Whether the bar this tile shows is cleared; null for a tile that is no bar. */
  ok: boolean | null;
}) {
  return (
    <div className="card pth-tile" data-ok={ok === null ? undefined : String(ok)}>
      <span className="pth-lbl">{label}</span>
      <span className="pth-val stat">{value}</span>
      <span className="pth-sub">{sub}</span>
    </div>
  );
}

function RegionRow({
  g,
  bloc,
  move,
  counties,
  was,
  onMove,
}: {
  g: RegionNow;
  bloc: string;
  move: Move;
  counties: CountyNow[];
  was: Map<string, CountyNow>;
  onMove: (patch: Partial<Move>) => void;
}) {
  const id = useId();
  const moved = move.share !== 0 || move.turnout !== 0;
  return (
    <li className="pth-row" data-moved={moved}>
      <div className="pth-head">
        <h3>{g.name}</h3>
        <p className="meta">
          {g.counties} {g.counties === 1 ? "county" : "counties"} · {percent(g.weight)} of valid
          votes
        </p>
      </div>
      <p className="pth-shares">
        <span>
          <span className="meta">{bloc}</span> {percent(g.share)} →{" "}
          <strong className="stat">{percent(g.now.share)}</strong>
        </span>
        <span className="meta">
          Turnout {percent(g.turnout)}
          {move.turnout !== 0 ? ` → ${percent(g.now.turnout)}` : ""}
        </span>
        <span className="meta">
          2017 → 2022: {percent(g.swing.from)} → {percent(g.swing.to)}
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
        <span className="stat">{signed(g.votesAdded)}</span>
        <span className="meta">votes for {bloc}</span>
      </p>
      <details className="pth-counties">
        <summary>Counties</summary>
        <ul>
          {counties.map((c) => {
            const at = atLine(c);
            return (
              <li key={c.code} data-at={at}>
                <span>{c.name}</span>
                <span className="stat">
                  {sharePercent(was.get(c.code)?.share ?? 0)} → {sharePercent(c.share)}
                </span>
                <span className={`pill ${at ? "pill--ok" : "pill--muted"}`}>
                  {at ? "25% or more" : "under 25%"}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

/**
 * The 2022 presidential map, region by region: change a region's share or
 * turnout and see whether the two bars of Article 138 are cleared. It starts
 * open on a presidential campaign and folded away on any other. Worked out in
 * the browser from data/kenya; nothing is saved.
 */
export function PathToStateHouse({
  startSide,
  president,
}: {
  /** The campaign's side in 2022, when it has one set. */
  startSide: Side | null;
  president: boolean;
}) {
  const [chosen, setChosen] = useState<Side | null>(null);
  const [moves, setMoves] = useState<Scenario>({});
  const side = chosen ?? startSide ?? "ruto";
  const bloc = SIDES[side].bloc;
  const rivalBloc = SIDES[SIDES[side].rival].bloc;

  const base = useMemo(() => runPath(kenya, side), [side]);
  const now = useMemo(() => runPath(kenya, side, moves), [side, moves]);
  const lines = useMemo(() => pathLines(kenya, side, moves), [side, moves]);
  const was = useMemo(() => new Map(base.counties.map((c) => [c.code, c])), [base]);

  const t = now.totals;
  const ahead = lead(t.margin);
  const need = Math.max(0, RULE.countiesNeeded - t.counties);
  // "+5" means the opposite for the other side, so changing side starts again.
  const pick = (s: Side) => {
    setChosen(s);
    setMoves({});
  };

  return (
    <details className="card pth" open={president}>
      <summary>
        <h2>Path to State House</h2>
        <span className="meta">The 2022 map, region by region</span>
      </summary>
      <div className="pth-body">
        <p className="meta pth-intro">
          Start from the 2022 result and change a region's share or turnout. A win takes more than
          half of the valid votes and {percent(RULE.countyShare)} in at least {RULE.countiesNeeded}{" "}
          of the {RULE.counties} counties.
          {president
            ? ""
            : " This is the race above yours: the presidential count your ticket sits in."}
        </p>
        <div className="pth-side">
          <span className="eyebrow">Start from</span>
          <div className="seg" role="group" aria-label="Start from">
            <button type="button" aria-pressed={side === "ruto"} onClick={() => pick("ruto")}>
              {SIDES.ruto.bloc}'s 2022 vote
            </button>
            <button type="button" aria-pressed={side === "raila"} onClick={() => pick("raila")}>
              {SIDES.raila.bloc}'s 2022 vote
            </button>
          </div>
        </div>
        <div className="pth-score">
          <Tile
            label="Share of valid votes"
            value={sharePercent(t.share)}
            ok={t.clearsHalf}
            sub={
              t.clearsHalf
                ? "Cleared · more than half"
                : `Short · ${count(t.toHalf)} ${t.toHalf === 1 ? "vote" : "votes"} to more than half`
            }
          />
          <Tile
            label="Counties at 25%"
            value={String(t.counties)}
            ok={t.clearsCounties}
            sub={`${t.clearsCounties ? "Cleared" : `Short by ${need}`} · of ${RULE.counties}, ${RULE.countiesNeeded} needed`}
          />
          <Tile
            label={ahead.label}
            value={ahead.text || "—"}
            ok={null}
            sub={
              ahead.label === "Level"
                ? `Level with ${rivalBloc}`
                : `votes ${ahead.label === "Ahead by" ? "over" : "behind"} ${rivalBloc}`
            }
          />
        </div>
        <ol className="fd-list pth-lines" aria-label="What it says">
          {lines.map((r) => (
            <Reading key={r.id} r={r} />
          ))}
        </ol>
        <ul className="pth-rows" aria-label="Regions, biggest first">
          {bySize(now.regions).map((g) => (
            <RegionRow
              key={g.id}
              g={g}
              bloc={bloc}
              move={moves[g.id] ?? NO_MOVE}
              counties={now.counties.filter((c) => c.region === g.id)}
              was={was}
              onMove={(patch) => setMoves((m) => setMove(m, g.id, patch))}
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
              It starts from IEBC's 2022 result by county (Form 34C). The 2027 field is not set, so
              this starts from the two sides of 2022 rather than from a forecast.
            </li>
            <li>
              A region's share moves every county in it by that many points; the other side and the
              other candidates give way in proportion. Turnout adds or removes voters who split like
              the county's own vote. The diaspora's {count(kenya.outside.valid)} valid votes stay as
              they were.
            </li>
            <li>
              Article 138: a winner needs more than half of the valid votes and at least 25% of them
              in each of at least {RULE.countiesNeeded} of the {RULE.counties} counties; otherwise
              the top two go to a runoff within {RULE.runoffDays} days. Counted on valid votes, as
              IEBC declared 2022.
            </li>
            <li>
              Regions are sets of counties, as analysts group them (data/kenya/regions.csv). They
              describe places. Nothing here records or guesses anyone's community, and every
              county's vote is made of many kinds of people.
            </li>
            <li>
              2017 is the count the Supreme Court annulled (Wikipedia's county table), shown only to
              say how far a region has moved before.
            </li>
          </ul>
        </details>
      </div>
    </details>
  );
}
