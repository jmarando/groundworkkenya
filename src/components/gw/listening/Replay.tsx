// Listening's Replay: any past week or month, day by day, and the period in five lines set against
// the one before. A day nothing ran is shown blank, never as a quiet day. Plain code decides every
// line (src/lib/replay.ts); this only shows it. Pure; the data comes from ReplayPanel.
import { shortDay } from "@/lib/field-plan";
import { nf } from "@/lib/format";
import {
  bars,
  fiveLines,
  periodFor,
  periodLabel,
  periodWord,
  replaySoWhat,
  stepPeriod,
  type Bar,
  type Period,
} from "@/lib/replay";
import type { ReplayData } from "@/lib/replay.functions";

const plural = (n: number, one: string) => `${nf.format(n)} ${n === 1 ? one : `${one}s`}`;

/** What a day's bar says to someone who cannot see it. */
function dayText(b: Bar): string {
  const d = shortDay(b.day);
  switch (b.state) {
    case "paused":
      return `${d}: Sweeping paused · nothing gathered`;
    case "nothing":
      return `${d}: Nothing gathered`;
    case "waiting":
      return `${d}: waiting for the first sweep`;
    case "future":
      return `${d}: not yet`;
    default:
      return b.posts === 0
        ? `${d}: nothing found`
        : `${d}: ${plural(b.posts, "post")} found, ${nf.format(b.angry)} angry, ${nf.format(b.neutral)} neutral, ${nf.format(b.warm)} warm, ${nf.format(b.unread)} not read yet`;
  }
}

function Bars({ list, open }: { list: Bar[]; open: (day: string) => void }) {
  const top = Math.max(1, ...list.map((b) => b.posts));
  const long = list.length > 14;
  // With nothing to draw, the days shrink to a thin row: an empty chart frame says nothing.
  const flat = !list.some((b) => b.state === "gathered" && b.posts > 0);
  return (
    <ol
      className={`rp-bars${flat ? " rp-bars--flat" : ""}${long ? " rp-bars--long" : ""}`}
      aria-label="Posts found each day"
    >
      {list.map((b, i) => {
        const text = dayText(b);
        const live = b.state === "gathered" && b.posts > 0;
        const number = Number(b.day.slice(8));
        const labelled = !long || i % 5 === 0 || i === list.length - 1;
        return (
          <li key={b.day} className={`rp-day rp-day--${b.state}`}>
            <button
              type="button"
              aria-label={text}
              title={text}
              disabled={!live}
              onClick={() => open(b.day)}
            >
              <span className="rp-plot">
                {live ? (
                  <span className="rp-col" style={{ height: `${(b.posts / top) * 100}%` }}>
                    {b.unread > 0 && <i className="u" style={{ flexGrow: b.unread }} />}
                    {b.warm > 0 && <i className="w" style={{ flexGrow: b.warm }} />}
                    {b.neutral > 0 && <i className="n" style={{ flexGrow: b.neutral }} />}
                    {b.angry > 0 && <i className="a" style={{ flexGrow: b.angry }} />}
                  </span>
                ) : (
                  <span className="rp-stub" aria-hidden="true" />
                )}
              </span>
              {!long && (
                <span className="rp-wd" aria-hidden="true">
                  {shortDay(b.day).split(" ")[0]}
                </span>
              )}
              <span className="rp-num" aria-hidden="true">
                {labelled ? number : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function ReplayView({
  data,
  setPeriod,
  openDay,
  compare = true,
  setCompare,
}: {
  data: ReplayData;
  setPeriod: (p: Period) => void;
  openDay: (day: string) => void;
  /** Whether the period is set against the one before; on by default. */
  compare?: boolean;
  setCompare?: (on: boolean) => void;
}) {
  const { period, today } = data;
  const { word, before } = periodWord(period);
  const list = bars(period, data.days, {
    recordBegins: data.recordBegins,
    today,
    late: new Map(Object.entries(data.late)),
  });
  const prev = compare ? data.prevStats : null;
  const lines = fiveLines(data.stats, prev, before);
  const soWhat = compare ? replaySoWhat(data.stats, prev, word) : null;

  const paused = list.filter((b) => b.state === "paused");
  const nothing = list.filter((b) => b.state === "nothing");
  const late = list.filter((b) => b.late > 0);
  // Week and month chips keep the part of the calendar the reader was looking at.
  const anchor = period.to < today ? period.to : today;

  return (
    <div className="card rp" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <h2>Replay</h2>
          <p className="meta">
            Any past week or month, day by day, set against the one before. A day nothing ran shows
            blank, never as a quiet day.
          </p>
        </div>
      </div>

      <div className="rp-controls">
        <div className="fchips" role="group" aria-label="Kind of period">
          <button
            type="button"
            className="fchip"
            aria-pressed={period.kind === "week"}
            onClick={() => setPeriod(periodFor("week", anchor))}
          >
            Week
          </button>
          <button
            type="button"
            className="fchip"
            aria-pressed={period.kind === "month"}
            onClick={() => setPeriod(periodFor("month", anchor))}
          >
            Month
          </button>
          <button
            type="button"
            className="fchip"
            aria-pressed={period.kind === "dates"}
            onClick={() => setPeriod({ kind: "dates", from: period.from, to: period.to })}
          >
            Pick dates
          </button>
        </div>
        <div className="rp-step">
          <button
            type="button"
            className="btn btn--sm"
            aria-label="Earlier period"
            onClick={() => setPeriod(stepPeriod(period, -1))}
          >
            ‹
          </button>
          <b className="rp-range">{periodLabel(period)}</b>
          <button
            type="button"
            className="btn btn--sm"
            aria-label="Later period"
            disabled={period.to >= today}
            onClick={() => setPeriod(stepPeriod(period, 1))}
          >
            ›
          </button>
        </div>
      </div>

      {period.kind === "dates" && (
        <div className="rp-dates">
          <label>
            From{" "}
            <input
              type="date"
              value={period.from}
              max={today}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setPeriod({ kind: "dates", from: v, to: v > period.to ? v : period.to });
              }}
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={period.to}
              min={period.from}
              max={today}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setPeriod({ kind: "dates", from: v < period.from ? v : period.from, to: v });
              }}
            />
          </label>
          <span className="meta">Up to 93 days.</span>
        </div>
      )}

      <label className="rp-compare">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare?.(e.target.checked)} />{" "}
        Compare with {before}
      </label>

      <Bars list={list} open={openDay} />
      <p className="rp-legend meta">
        <span>
          <i className="a" /> Angry
        </span>
        <span>
          <i className="n" /> Neutral
        </span>
        <span>
          <i className="w" /> Warm
        </span>
        <span>
          <i className="u" /> Not read yet
        </span>
        <span>Tap a day to read its posts.</span>
      </p>

      {paused.length > 0 && (
        <p className="meta">
          Sweeping paused · nothing gathered: {paused.map((b) => shortDay(b.day)).join(", ")}.
        </p>
      )}
      {nothing.length > 0 && (
        <p className="meta">
          Nothing gathered{" "}
          {nothing.length === list.length
            ? "in these days"
            : `on ${nothing.map((b) => shortDay(b.day)).join(", ")}`}
          : that was before each day was recorded, so we cannot tell whether sweeping ran.
        </p>
      )}
      {late.map((b) => (
        <p className="meta" key={b.day}>
          {shortDay(b.day)}: {nf.format(b.late)}{" "}
          {b.late === 1 ? "was an older post" : "were older posts"} found late.
        </p>
      ))}

      <h3 className="rp-h">The {word} in five lines</h3>
      <ol className="rp-lines">
        {lines.map((l, i) => (
          <li key={i} className="rp-line">
            {l}
          </li>
        ))}
      </ol>
      {compare && data.partial && (
        <p className="meta">
          This {word} isn&apos;t over, so it is set against the same days of {before}.
        </p>
      )}
      {soWhat && (
        <p className="sv-sowhat">
          <b>So what</b> {soWhat}
        </p>
      )}
      {data.truncated && (
        <p className="f-note">
          There were more posts than could be read for these days, so issues and voices are counted
          from the newest. The bars and totals are exact.
        </p>
      )}
    </div>
  );
}
