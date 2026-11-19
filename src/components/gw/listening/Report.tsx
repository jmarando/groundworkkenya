// Listening's Report: the last 7, 30 or 90 days set against as many days before. The headline
// numbers, the mood about you as one score and day by day, your share of the conversation against
// your rivals, where the posts came from, and the phrases people use. Plain code decides every
// figure (src/lib/listening-report.ts); this only shows them, and every one opens its posts. Pure;
// the data comes from ReportPanel.
import { Delta } from "@/components/gw/briefing/parts";
import { shortDay } from "@/lib/field-plan";
import { nf, short } from "@/lib/format";
import {
  moodPeaks,
  type Figure,
  type MoodDay,
  type PhraseRow,
  type Reported,
  type Row,
} from "@/lib/listening-report";
import type { ReportData } from "@/lib/listening-report.functions";
import { sourceName } from "@/lib/listening-read";
import { nairobiDay } from "@/lib/nairobi-date";
import { periodLabel } from "@/lib/replay";

/** Opens the posts behind a figure: what to call them, their ids (newest first), how many in all. */
export type Open = (label: string, ids: string[], total: number) => void;

export const SPANS = [7, 30, 90] as const;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${nf.format(n)} ${n === 1 ? one : many}`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
const range = (from: string, to: string) => periodLabel({ kind: "dates", from, to });
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** Against the days before: an arrow and a number, "new" when there was nothing before. */
function Change({ fig, unit = "%" }: { fig: Figure; unit?: string }) {
  if (fig.change === null) return fig.value > 0 ? <span className="mb-delta">new</span> : null;
  return <Delta value={fig.change} unit={unit} neutral />;
}

function Tile({
  label,
  fig,
  value,
  format = (n) => nf.format(n),
  note,
  onOpen,
}: {
  label: string;
  fig: Figure;
  value: string;
  /** How the figure before is written, as the figure itself is. */
  format?: (n: number) => string;
  note?: string | undefined;
  onOpen?: (() => void) | undefined;
}) {
  const body = (
    <>
      <span className="kpi-lbl">{label}</span>
      <span className="kpi-val stat">{value}</span>
      <span className="kpi-sub">
        <Change fig={fig} />
        {fig.change !== null ? ` from ${format(fig.before)}` : ""}
      </span>
      {note && <span className="kpi-sub">{note}</span>}
    </>
  );
  return onOpen ? (
    <button type="button" className="card kpi kpi-link rpt-tile" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="card kpi">{body}</div>
  );
}

/** "12 of 40 posts say how often they were seen." */
const reportedNote = (fig: Reported, posts: number, what: string) =>
  posts === 0
    ? undefined
    : fig.from === 0
      ? `No post says how often it was ${what}.`
      : `${nf.format(fig.from)} of ${plural(posts, "post")} say how often they were ${what}.`;

/** What a day's column says to someone who cannot see it. */
const dayText = (d: MoodDay) => {
  const posts = d.warm + d.neutral + d.angry + d.unread;
  return posts === 0
    ? `${shortDay(d.day)}: nothing about you`
    : `${shortDay(d.day)}: ${plural(posts, "post")}, ${nf.format(d.angry)} angry, ${nf.format(d.neutral)} neutral, ${nf.format(d.warm)} warm, ${nf.format(d.unread)} not read yet`;
};

function Days({ days, open }: { days: MoodDay[]; open: Open }) {
  const top = Math.max(1, ...days.map((d) => d.warm + d.neutral + d.angry + d.unread));
  const long = days.length > 14;
  return (
    <ol className={`rp-bars${long ? " rp-bars--long" : ""}`} aria-label="Posts about you each day">
      {days.map((d, i) => {
        const posts = d.warm + d.neutral + d.angry + d.unread;
        const text = dayText(d);
        const labelled = !long || i % 5 === 0 || i === days.length - 1;
        return (
          <li key={d.day} className={`rp-day${posts ? " rp-day--gathered" : ""}`}>
            <button
              type="button"
              aria-label={text}
              title={text}
              disabled={!posts}
              onClick={() => open(`Posts about you, ${shortDay(d.day)}`, d.ids, posts)}
            >
              <span className="rp-plot">
                {posts ? (
                  <span className="rp-col" style={{ height: `${(posts / top) * 100}%` }}>
                    {d.unread > 0 && <i className="u" style={{ flexGrow: d.unread }} />}
                    {d.warm > 0 && <i className="w" style={{ flexGrow: d.warm }} />}
                    {d.neutral > 0 && <i className="n" style={{ flexGrow: d.neutral }} />}
                    {d.angry > 0 && <i className="a" style={{ flexGrow: d.angry }} />}
                  </span>
                ) : (
                  <span className="rp-stub" aria-hidden="true" />
                )}
              </span>
              <span className="rp-num" aria-hidden="true">
                {labelled ? Number(d.day.slice(8)) : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Rows({
  rows,
  open,
  what,
  you,
}: {
  rows: Row[];
  open: Open;
  /** What a row's posts are called when opened: "Posts about you on X". */
  what: (r: Row) => string;
  /** The row to draw in the campaign's own colour. */
  you?: string;
}) {
  return (
    <ul className="rpt-rows">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            disabled={!r.posts}
            onClick={() => open(what(r), r.ids, r.posts)}
            aria-label={`${r.label}: ${r.share}%, ${plural(r.posts, "post")}`}
          >
            <span className="top">
              <b>{r.label}</b>
              <span className="mono">{r.share}%</span>
            </span>
            <span className="barlist-track" aria-hidden="true">
              <i
                style={{
                  width: `${Math.max(r.share, r.posts ? 1 : 0)}%`,
                  ...(r.key === you ? { background: "var(--gw-accent)" } : {}),
                }}
              />
            </span>
            <span className="meta">
              {plural(r.posts, "post")}
              {r.views !== null ? ` · seen ${short(r.views)}` : " · no views counted"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PhraseList({
  title,
  rows,
  open,
  empty,
}: {
  title: string;
  rows: PhraseRow[];
  open: Open;
  empty: string;
}) {
  return (
    <div>
      <h3 className="kpi-lbl">{title}</h3>
      {rows.length ? (
        <ol className="rpt-ph">
          {rows.map((r) => (
            <li key={r.phrase}>
              <button
                type="button"
                onClick={() => open(`Posts saying “${r.phrase}”`, r.ids, r.posts)}
                title={`Popularity ${r.score} of 100`}
              >
                <span className="t">{r.phrase}</span>
                <Change fig={{ value: r.posts, before: r.before, change: r.change }} />
                <span className="rpt-ph-n">
                  <span className="barlist-track" aria-hidden="true">
                    <i style={{ width: `${r.score}%` }} />
                  </span>
                  <span className="mono">{nf.format(r.posts)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="f-note">{empty}</p>
      )}
    </div>
  );
}

const SIZES = 5;

/** The notes that say what the figures cannot see, before anyone reads them. */
function notes(data: ReportData): string[] {
  const out: string[] = [];
  if (data.quiet.length) {
    const lanes = data.quiet.map(
      (q) => `${sourceName(q.source)} (since ${shortDay(nairobiDay(q.since))})`,
    );
    const list =
      lanes.length === 1 ? lanes[0]! : `${lanes.slice(0, -1).join(", ")} and ${lanes.at(-1)}`;
    out.push(
      `Nothing new has come from ${list}, so these days hold only what the other lanes found.`,
    );
  }
  if (data.setAside > 0)
    out.push(
      `${plural(data.setAside, "post")} found in these days ${data.setAside === 1 ? "was" : "were"} set aside as not about the seat (adverts, other places) and ${data.setAside === 1 ? "is" : "are"} left out of every figure.`,
    );
  if (data.truncated)
    out.push(
      "There were more posts than the Report reads at once, so the figures come from the newest and the days before may be undercounted.",
    );
  return out;
}

export function ReportView({
  data,
  span,
  setSpan,
  open,
}: {
  data: ReportData;
  /** How many days the Report covers, ending today. */
  span: number;
  setSpan: (days: number) => void;
  open: Open;
}) {
  const { figures, mood, moodBefore, days } = data;
  const posts = figures.posts.value;
  const shown = range(data.from, data.to);
  const shift =
    mood.net !== null && moodBefore.net !== null
      ? { value: mood.net, before: moodBefore.net, change: mood.net - moodBefore.net }
      : null;
  const { warm: warmest, angry: angriest } = moodPeaks(days);
  const cloud = [...data.cloud].sort((a, b) =>
    a.phrase.replace(/^#/, "").localeCompare(b.phrase.replace(/^#/, "")),
  );
  const most = data.cloud[0]?.posts ?? 0;
  const least = data.cloud.at(-1)?.posts ?? 0;
  const size = (n: number) => Math.round(((n - least) / (most - least || 1)) * (SIZES - 1));
  const said = notes(data);

  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Report</h2>
            <p className="meta">
              Posts your own keywords found, {shown}, set against the {plural(span, "day")} before (
              {range(data.beforeFrom, data.beforeTo)}). A post counts on the day it was posted, or
              the day it was found when the platform gives no date. Every number opens its posts.
            </p>
          </div>
        </div>
        <div className="fchips" role="group" aria-label="Days the Report covers">
          {SPANS.map((d) => (
            <button
              type="button"
              key={d}
              className="fchip"
              aria-pressed={span === d}
              onClick={() => setSpan(d)}
            >
              Last {d} days
            </button>
          ))}
        </div>
        {said.length > 0 && (
          <ul className="rpt-notes">
            {said.map((n) => (
              <li key={n} className="f-note">
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="g4" style={{ marginTop: 14 }}>
        <Tile
          label="Posts about you"
          fig={figures.posts}
          value={nf.format(posts)}
          onOpen={posts ? () => open("Posts about you", data.youIds, posts) : undefined}
        />
        <Tile
          label="Views"
          fig={figures.views}
          value={figures.views.from ? short(figures.views.value) : "–"}
          format={short}
          note={reportedNote(figures.views, posts, "seen")}
          onOpen={
            figures.views.from
              ? () =>
                  open(
                    "Posts about you that say how often they were seen",
                    data.viewIds,
                    figures.views.from,
                  )
              : undefined
          }
        />
        <Tile
          label="Shares"
          fig={figures.shares}
          value={figures.shares.from ? short(figures.shares.value) : "–"}
          format={short}
          note={reportedNote(figures.shares, posts, "shared")}
          onOpen={
            figures.shares.from
              ? () =>
                  open(
                    "Posts about you that say how often they were shared",
                    data.shareIds,
                    figures.shares.from,
                  )
              : undefined
          }
        />
        <Tile
          label="Voices"
          fig={figures.voices}
          value={nf.format(figures.voices.value)}
          note="Accounts and outlets that posted about you."
          onOpen={posts ? () => open("Posts about you", data.youIds, posts) : undefined}
        />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Mood about you</h2>
            <p className="meta">Posts about you read for mood, {shown}.</p>
          </div>
        </div>
        {mood.net === null || mood.verdict === null ? (
          <p className="f-note">
            {posts
              ? "No post about you in these days has been read for mood yet. The next sweep reads the newest."
              : "No post about you in these days."}
          </p>
        ) : (
          <div className="rpt-mood">
            <div>
              <span className="kpi-lbl">Net mood</span>
              <span className="kpi-val stat">{signed(mood.net)}</span>
              {shift && (
                <span className="kpi-sub">
                  <Delta value={shift.change} unit=" pts" /> from {signed(shift.before)} in the days
                  before
                </span>
              )}
              <div
                className="meter"
                role="img"
                aria-label={`Net mood ${signed(mood.net)}, on a scale from −100 to +100`}
              >
                <span className="meter-mark" style={{ left: `${(mood.net + 100) / 2}%` }} />
              </div>
              <p className="meta rpt-scale" aria-hidden="true">
                <span>−100</span>
                <span>0</span>
                <span>+100</span>
              </p>
              <p className="meta">The warm share less the angry share of the posts read.</p>
            </div>
            <div>
              <b>{mood.verdict}</b>
              <p className="meta">
                {pct(mood.warm, mood.read)}% warm, {pct(mood.neutral, mood.read)}% neutral and{" "}
                {pct(mood.angry, mood.read)}% angry, of {plural(mood.read, "post")} read.
              </p>
              <span
                className="lsn-mood"
                role="img"
                aria-label={`${mood.warm} warm, ${mood.neutral} neutral, ${mood.angry} angry`}
                style={{ marginTop: 10 }}
              >
                <i className="w" style={{ width: `${(mood.warm / mood.read) * 100}%` }} />
                <i className="n" style={{ width: `${(mood.neutral / mood.read) * 100}%` }} />
                <i className="a" style={{ width: `${(mood.angry / mood.read) * 100}%` }} />
              </span>
              {mood.unread > 0 && (
                <p className="f-note">{plural(mood.unread, "post")} not read for mood yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Day by day</h2>
            <p className="meta">
              Posts about you each day, by mood. Replay shows the days sweeping paused.
            </p>
          </div>
        </div>
        {posts ? (
          <>
            <Days days={days} open={open} />
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
            {(warmest || angriest) && (
              <p className="meta">
                {warmest && (
                  <>
                    Warmest day:{" "}
                    <button
                      type="button"
                      className="linklike"
                      onClick={() =>
                        open(
                          `Posts about you, ${shortDay(warmest.day)}`,
                          warmest.ids,
                          warmest.warm + warmest.neutral + warmest.angry + warmest.unread,
                        )
                      }
                    >
                      {shortDay(warmest.day)}
                    </button>
                    , {plural(warmest.warm, "warm post")}.{" "}
                  </>
                )}
                {angriest && (
                  <>
                    Angriest day:{" "}
                    <button
                      type="button"
                      className="linklike"
                      onClick={() =>
                        open(
                          `Posts about you, ${shortDay(angriest.day)}`,
                          angriest.ids,
                          angriest.warm + angriest.neutral + angriest.angry + angriest.unread,
                        )
                      }
                    >
                      {shortDay(angriest.day)}
                    </button>
                    , {plural(angriest.angry, "angry post")}.
                  </>
                )}
              </p>
            )}
          </>
        ) : (
          <p className="f-note">No post about you in these days.</p>
        )}
      </div>

      <div className="g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Share of the conversation</h2>
              <p className="meta">
                Your keywords&apos; posts against each rival&apos;s, {shown}. Issues and wider news
                are left out. A post counts for the keyword that found it first.
              </p>
            </div>
          </div>
          {data.voice.length ? (
            <Rows
              rows={data.voice}
              open={open}
              you="you"
              what={(r) => (r.key === "you" ? "Posts about you" : `Posts about ${r.label}`)}
            />
          ) : (
            <p className="f-note">Follow a rival as a keyword to compare with.</p>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Where it was said</h2>
              <p className="meta">Posts about you by where they were found, {shown}.</p>
            </div>
          </div>
          {data.sources.length ? (
            <Rows rows={data.sources} open={open} what={(r) => `Posts about you on ${r.label}`} />
          ) : (
            <p className="f-note">No post about you in these days.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>What people say</h2>
            <p className="meta">
              The two-word phrases and hashtags in the most posts about you, {shown}, each counted
              once a post. Tap one to read its posts.
            </p>
          </div>
        </div>
        {cloud.length ? (
          <>
            <ul className="rpt-cloud">
              {cloud.map((p) => (
                <li key={p.phrase}>
                  <button
                    type="button"
                    className={`rpt-s${size(p.posts)}`}
                    title={plural(p.posts, "post")}
                    onClick={() => open(`Posts saying “${p.phrase}”`, p.ids, p.posts)}
                  >
                    {p.phrase}
                  </button>
                </li>
              ))}
            </ul>
            <div className="rpt-tables">
              <PhraseList
                title="Phrases"
                rows={data.phrases}
                open={open}
                empty="No phrase is in two posts or more yet."
              />
              <PhraseList
                title="Hashtags"
                rows={data.hashtags}
                open={open}
                empty="No hashtag is in two posts or more yet."
              />
            </div>
          </>
        ) : (
          <p className="f-note">Phrases show once a few posts about you use the same words.</p>
        )}
      </div>
    </>
  );
}
