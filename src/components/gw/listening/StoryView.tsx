// One story, followed: the first post we found, everyone who picked it up, how its views grew, who
// carried it, and what to do. Plain code decides every line (src/lib/stories.ts); this only shows
// it. "First seen" is the first post we found, not proof of who started it, and the screen says so.
// Pure; the data comes from StoryPanel.
import { dayTime, nf, short } from "@/lib/format";
import { sourceName } from "@/lib/listening-read";
import {
  amplifiers,
  daysGoing,
  pickups,
  placeOf,
  platformSplit,
  soWhat,
  storyMood,
  trendOf,
  viewsCurve,
  type Pickup,
} from "@/lib/stories";
import type { StoryData } from "@/lib/stories.functions";

const HOUR = 3_600_000;

const MOOD_PILL = {
  angry: { label: "Angry", cls: "pill--amber" },
  warm: { label: "Warm", cls: "pill--ok" },
  mixed: { label: "Mixed", cls: "pill--muted" },
  unread: { label: "Mood not read", cls: "pill--muted" },
} as const;

/** A top for the views axis that reads round: 1, 2 or 5 times a power of ten. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const unit = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].map((k) => k * unit).find((c) => c >= v) ?? 10 * unit) as number;
}

function Curve({
  curve,
  marks,
  label,
}: {
  curve: { at: string; views: number }[];
  marks: Pickup[];
  label: string;
}) {
  const W = 640;
  const H = 220;
  const L = 58;
  const R = 14;
  const T = 14;
  const B = 30;
  const times = [...curve.map((c) => Date.parse(c.at)), ...marks.map((m) => Date.parse(m.at))];
  const t0 = Math.min(...times);
  const span = Math.max(Math.max(...times) - t0, HOUR);
  const top = niceMax(Math.max(...curve.map((c) => c.views)));
  const x = (t: number) => L + ((t - t0) / span) * (W - L - R);
  const y = (v: number) => H - B - (v / top) * (H - T - B);
  const valueAt = (t: number) =>
    curve.filter((c) => Date.parse(c.at) <= t).reduce((_, c) => c.views, 0);
  const points = curve
    .map((c) => `${x(Date.parse(c.at)).toFixed(1)},${y(c.views).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sv-chart" role="img" aria-label={label}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line className="sv-grid" x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} />
          <text className="sv-lab" x={L - 14} y={y(top * f) + 4} textAnchor="end">
            {short(top * f)}
          </text>
        </g>
      ))}
      {[0, 1, 2, 3].map((i) => {
        const t = t0 + (span * i) / 3;
        return (
          <text
            key={i}
            className="sv-lab"
            x={x(t)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}
          >
            {i === 0 ? dayTime(new Date(t).toISOString()) : `+${Math.round((t - t0) / HOUR)}h`}
          </text>
        );
      })}
      <polyline className="sv-line" fill="none" points={points} />
      {curve.length === 1 && (
        <circle className="sv-dot" cx={x(Date.parse(curve[0]!.at))} cy={y(curve[0]!.views)} r={3} />
      )}
      {marks.map((m, i) => (
        <g className="sv-mark" key={m.id}>
          <circle cx={x(Date.parse(m.at))} cy={y(valueAt(Date.parse(m.at)))} r={9} />
          <text x={x(Date.parse(m.at))} y={y(valueAt(Date.parse(m.at))) + 3.5} textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function StoryView({
  data,
  now,
  back,
  react,
  brief,
  handle,
  busy,
}: {
  data: StoryData;
  now: number;
  back: () => void;
  /** Drafts a reaction to the story's most-seen post. */
  react?: (mentionId: string, storyId?: string) => void;
  /** Opens the big voices to brief. */
  brief?: () => void;
  /** Marks the story handled. */
  handle?: () => void;
  busy?: boolean;
}) {
  const { story, posts, readings } = data;
  if (posts.length === 0)
    return (
      <div className="card sv" style={{ marginTop: 14 }}>
        <button type="button" className="linklike" onClick={back}>
          ← Back
        </button>
        <h2>{story.title}</h2>
        <p className="f-note">This story has no posts now: the ones it held no longer match.</p>
      </div>
    );

  const list = pickups(posts);
  const curve = viewsCurve(
    readings,
    posts.map((p) => p.id),
  );
  const trend = trendOf(curve, now);
  const amps = amplifiers(posts, 3);
  const split = platformSplit(posts);
  const total = Math.max(
    posts.reduce((t, p) => t + (p.reach ?? 0), 0),
    curve[curve.length - 1]?.views ?? 0,
  );
  const first = list[0]!;
  const firstReading = readings
    .filter((r) => r.mentionId === first.id && r.reach !== null)
    .sort((a, b) => a.at.localeCompare(b.at))[0]?.reach;
  const mood = storyMood(posts);
  const line = soWhat({
    mood,
    place: placeOf(posts),
    trend: trend.kind,
    views: total,
    days: daysGoing(first.at, now),
    outlets: new Set(list.filter((p) => p.outlet).map((p) => p.name)).size,
  });
  const mostSeen = [...posts]
    .filter((p) => !p.rivalIsUs)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))[0];
  const handled = story.status === "handled";
  const trendPill =
    trend.kind === "climbing"
      ? { label: "Still climbing", cls: "pill--amber" }
      : trend.kind === "settled"
        ? { label: "Settled", cls: "pill--muted" }
        : {
            label: `Not checked since ${trend.since ? dayTime(trend.since) : "the start"}`,
            cls: "pill--muted",
          };

  return (
    <div className="card sv" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <button type="button" className="linklike" onClick={back}>
            ← Back
          </button>
          <h2>{story.title}</h2>
          <p className="sv-pills">
            <span className={`pill ${MOOD_PILL[mood].cls}`}>{MOOD_PILL[mood].label}</span>
            <span className={`pill ${trendPill.cls}`}>{trendPill.label}</span>
            {handled && <span className="pill pill--muted">Handled ✓</span>}
            {story.issue && <span className="tag">{story.issue}</span>}
          </p>
        </div>
      </div>

      {curve.length > 0 ? (
        <Curve
          curve={curve}
          marks={list}
          label={`Views of this story over time: ${short(total)} after ${daysGoing(first.at, now) < 1 ? "under a day" : `${daysGoing(first.at, now)} days`}`}
        />
      ) : (
        <p className="f-note">No view counts for these posts.</p>
      )}

      <ol className="sv-list">
        {list.map((p, i) => (
          <li key={p.id}>
            <b>{`${i + 1} · `}</b>
            {p.first ? "First seen · " : ""}
            {dayTime(p.at)} ·{" "}
            <a href={p.url} target="_blank" rel="noreferrer">
              {p.name}
            </a>
            {p.outlet ? " runs it" : ` on ${sourceName(p.platform)}`}
            {p.first && firstReading != null
              ? ` · ${nf.format(firstReading)} views at first`
              : p.views !== null
                ? ` · ${nf.format(p.views)} views so far`
                : ""}
          </li>
        ))}
      </ol>

      {(split.length > 0 || amps.length > 0) && (
        <p className="meta">
          {split.length > 0 &&
            `${split.map((s) => `${sourceName(s.source)} ${Math.round(s.share * 100)}%`).join(" · ")} of the views.`}
          {amps.length > 0 &&
            ` Top amplifiers: ${amps
              .map((a) => `${a.name} ${short(a.views)}${a.mood ? ` (${a.mood})` : ""}`)
              .join(", ")}.`}
        </p>
      )}

      <p className="sv-sowhat">
        <b>So what</b> {line}
      </p>

      {data.canAct && (react || brief || handle) && (
        <div className="sv-acts">
          {react && mostSeen && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => react(mostSeen.id, story.id)}
            >
              React →
            </button>
          )}
          {brief && (
            <button type="button" className="btn btn--sm" onClick={brief}>
              Brief voices →
            </button>
          )}
          {handle && !handled && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={handle}
            >
              Mark handled
            </button>
          )}
        </div>
      )}
    </div>
  );
}
