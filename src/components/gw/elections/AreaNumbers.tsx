import { TODO_NAMES } from "@/lib/atlas";
import {
  share1,
  signedPoints,
  TODO_COLOURS,
  votes,
  whole,
  type AreaFigures,
} from "@/lib/atlas-view";

const DASH = "—";
const growth = (rate: number) => `${rate >= 0 ? "+" : "−"}${whole(Math.abs(rate))} since 2017`;

/** What to do here and why, then the area's five numbers. */
export function AreaNumbers({
  f,
  year,
  raceText,
  canSetSides,
  onSetup,
}: {
  f: AreaFigures;
  year: number;
  /** The race as it reads inside a sentence: "governor", "MP". */
  raceText: string;
  canSetSides: boolean;
  onSetup: () => void;
}) {
  return (
    <>
      {f.todo ? (
        <div className="el-todo" style={{ borderLeftColor: TODO_COLOURS[f.todo.todo] }}>
          <span className="el-chip" style={{ background: TODO_COLOURS[f.todo.todo] }}>
            {TODO_NAMES[f.todo.todo]}
          </span>
          <span>{f.todo.reason}</span>
          {f.todo.todo === "no-side" ? (
            canSetSides ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onSetup}>
                Set sides
              </button>
            ) : (
              <span className="dim">Ask the candidate or campaign manager to set it.</span>
            )
          ) : null}
        </div>
      ) : (
        <p className="f-note">
          No {raceText} result found here for {year} yet.
        </p>
      )}
      <div className="ladder fx2">
        <div>
          <span className="l">Our share</span>
          <span className="n stat">{f.ourShare === null ? DASH : share1(f.ourShare)}</span>
          <span className="s">
            {f.ourShare === null
              ? DASH
              : f.listedOnly
                ? "of the candidates listed"
                : f.margin === null
                  ? DASH
                  : `margin ${signedPoints(f.margin)}`}
          </span>
        </div>
        <div>
          <span className="l">Turnout</span>
          <span className="n stat">{f.turnout === null ? DASH : whole(f.turnout)}</span>
          <span className="s">
            {f.count?.registered ? `of ${votes(f.count.registered)} registered` : "not found yet"}
          </span>
        </div>
        <div>
          <span className="l">Swing</span>
          <span className="n stat">{f.swing === null ? DASH : signedPoints(f.swing)}</span>
          <span className="s">{f.yearBefore ? `since ${f.yearBefore}` : "no earlier result"}</span>
        </div>
        <div>
          <span className="l">Votes within reach</span>
          <span className="n stat">{f.reach ? votes(f.reach.total) : DASH}</span>
          <span className="s">
            {!f.reach
              ? "needs a result and a side"
              : f.turnout === null
                ? "all from a 5-point swing; turnout not found yet"
                : `${votes(f.reach.turnout)} from turnout, ${votes(f.reach.persuasion)} from a 5-point swing`}
          </span>
        </div>
        <div>
          <span className="l">Registered</span>
          <span className="n stat">{f.registered === null ? DASH : votes(f.registered)}</span>
          <span className="s">
            {f.registered === null
              ? "not found yet"
              : f.growth && f.growth.rate !== null
                ? growth(f.growth.rate)
                : "the 2022 register"}
          </span>
        </div>
      </div>
      {f.tag ? <p className="el-src">{f.tag}</p> : null}
    </>
  );
}
