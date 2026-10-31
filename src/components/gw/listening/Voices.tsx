// Listening's voices: how each platform's conversation differs, the accounts and outlets that lead
// it, and a map of them by how warm they are to the campaign and how often they are heard.
// Worked out in src/lib/voices.ts from the posts Listening kept; every dot opens its posts.
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { BigVoicesPanel } from "@/components/gw/listening/BigVoicesPanel";
import { Drill, type React } from "@/components/gw/listening/Overview";
import type { BigVoice, BriefFocus } from "@/lib/big-voices";
import { getListeningPosts } from "@/lib/listening-history.functions";
import { nf } from "@/lib/format";
import type { Mention } from "@/lib/listening.functions";
import { sourceName, type Focus } from "@/lib/listening-read";
import { platformContrast, platforms, voiceOf, voices, type Voice } from "@/lib/voices";

type Mark = (ids: string[], status: "new" | "actioned") => void;

const COLOUR: Record<string, string> = {
  facebook: "#1877f2",
  x: "var(--foreground)",
  instagram: "#c13584",
  tiktok: "#00a3a3",
  youtube: "#e62117",
  reddit: "#ff4500",
  news: "#a0782c",
  web: "#7a7a7a",
};
const colour = (p: string) => COLOUR[p] ?? "#999";
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export function Voices({
  mentions,
  busy,
  mark,
  react,
  briefFocus,
  clearBriefFocus,
}: {
  mentions: Mention[];
  busy: boolean;
  mark: Mark;
  react?: React;
  /** Set when a story's Brief voices opened this tab: its level, and its issue. */
  briefFocus?: BriefFocus | null;
  clearBriefFocus?: () => void;
}) {
  const [days, setDays] = useState(30);
  const [focus, setFocus] = useState<Focus | null>(null);
  // A big voice's posts are read by id, so ones older than the latest 600 show too.
  const [bigFocus, setBigFocus] = useState<{ focus: Focus; posts: Mention[] } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const fetchPosts = useServerFn(getListeningPosts);
  const now = useMemo(() => Date.now(), [mentions]);
  const reads = useMemo(() => platforms(mentions, { now, days }), [mentions, now, days]);
  const all = useMemo(() => voices(mentions, { now, days }), [mentions, now, days]);
  const contrast = platformContrast(reads);

  const open = (v: Voice) =>
    setFocus({
      label: `${v.name} on ${sourceName(v.platform)}`,
      ids: mentions.filter((m) => !m.rivalId && voiceOf(m)?.key === v.key).map((m) => m.id),
    });

  const openBig = async (v: BigVoice) => {
    setOpenError(null);
    setOpening(true);
    try {
      const page = await fetchPosts({ data: { ids: v.postIds } });
      setBigFocus({
        focus: {
          label: `${v.name} on ${sourceName(v.platform)}`,
          ids: page.posts.map((p) => p.id),
        },
        posts: page.posts,
      });
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : "Those posts could not be read.");
    } finally {
      setOpening(false);
    }
  };

  if (bigFocus) {
    return (
      <Drill
        focus={bigFocus.focus}
        posts={bigFocus.posts}
        back={() => setBigFocus(null)}
        busy={busy}
        mark={mark}
        react={react}
      />
    );
  }

  if (focus) {
    const posts = mentions.filter((m) => focus.ids?.includes(m.id));
    return (
      <Drill
        focus={focus}
        posts={posts}
        back={() => setFocus(null)}
        busy={busy}
        mark={mark}
        react={react}
      />
    );
  }

  return (
    <>
      <div className="fchips" style={{ marginTop: 14 }}>
        {[7, 30, 90].map((d) => (
          <button
            type="button"
            key={d}
            className="fchip"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
          >
            Last {d} days
          </button>
        ))}
      </div>

      <BigVoicesPanel
        days={days}
        open={(v) => void openBig(v)}
        react={react}
        focus={briefFocus ?? undefined}
        clearFocus={clearBriefFocus}
      />
      {opening && <p className="f-note">Opening posts…</p>}
      {openError && (
        <p className="f-note" role="alert">
          {openError}
        </p>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Platform by platform</h2>
            <p className="meta">
              {contrast ??
                "How much is said where, how it feels towards you, about what, and who leads it."}
            </p>
          </div>
        </div>
        <div className="vx-plats">
          {reads.map((r) => (
            <div className="vx-plat" key={r.platform}>
              <div className="vx-plat-head">
                <i style={{ background: colour(r.platform) }} aria-hidden="true" />
                <b>{r.name}</b>
                <span className="mono">{nf.format(r.posts)} posts</span>
              </div>
              <span
                className="lsn-mood"
                role="img"
                aria-label={`${r.positive} warm, ${r.neutral} neutral, ${r.negative} angry`}
              >
                {r.positive + r.neutral + r.negative > 0 && (
                  <>
                    <i
                      className="w"
                      style={{
                        width: `${(r.positive / (r.positive + r.neutral + r.negative)) * 100}%`,
                      }}
                    />
                    <i
                      className="n"
                      style={{
                        width: `${(r.neutral / (r.positive + r.neutral + r.negative)) * 100}%`,
                      }}
                    />
                    <i
                      className="a"
                      style={{
                        width: `${(r.negative / (r.positive + r.neutral + r.negative)) * 100}%`,
                      }}
                    />
                  </>
                )}
              </span>
              <p className="meta">
                {pct(r.warm)} warm · {pct(r.angry)} angry
                {r.topIssue ? ` · mostly ${r.topIssue}` : ""}
                {r.reach ? ` · seen ${nf.format(r.reach)}` : ""}
              </p>
              {r.voices.length > 0 ? (
                <ol className="vx-top">
                  {r.voices.map((v) => (
                    <li key={v.key}>
                      <button type="button" className="linklike" onClick={() => open(v)}>
                        {v.name}
                      </button>{" "}
                      <span className="meta">
                        {v.posts} {v.posts === 1 ? "post" : "posts"}
                        {v.reach ? `, seen ${nf.format(v.reach)}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="f-note">No named voices: these posts don&apos;t say who posted.</p>
              )}
            </div>
          ))}
          {reads.length === 0 && <p className="f-note">Nothing swept in these days.</p>}
        </div>
      </div>

      <VoiceMap voices={all.slice(0, 60)} open={open} />

      <details className="bv-all">
        <summary>See all voices ({all.length})</summary>
        <div className="card" style={{ marginTop: 10 }}>
          <div className="card-head">
            <div>
              <h2>Who shapes the conversation</h2>
              <p className="meta">
                Accounts and outlets behind the posts your keywords found, the most seen first
                (views where the platform counts them, else how often they post). Candidates&apos;
                own accounts are under Your rivals.
              </p>
            </div>
            <span className="mono">{all.length} voices</span>
          </div>
          <div className="vx-table" role="table" aria-label="Voices">
            <div className="vx-row vx-row--head" role="row">
              <span role="columnheader">Voice</span>
              <span role="columnheader">Posts</span>
              <span role="columnheader">Seen</span>
              <span role="columnheader">Towards you</span>
              <span role="columnheader">About</span>
              <span role="columnheader" />
            </div>
            {all.slice(0, 30).map((v) => (
              <div className="vx-row" role="row" key={v.key}>
                <span role="cell">
                  <i style={{ background: colour(v.platform) }} aria-hidden="true" />{" "}
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noreferrer">
                      {v.name}
                    </a>
                  ) : (
                    v.name
                  )}{" "}
                  <span className="meta">{sourceName(v.platform)}</span>
                </span>
                <span role="cell" className="mono">
                  {v.posts}
                </span>
                <span role="cell" className="mono">
                  {v.reach ? nf.format(v.reach) : "–"}
                </span>
                <span role="cell">
                  {v.mood === null ? "not read" : `${v.positive} warm · ${v.negative} angry`}
                </span>
                <span role="cell" className="meta">
                  {[
                    v.aboutYou ? `you ${v.aboutYou}` : "",
                    v.aboutRivals ? `rivals ${v.aboutRivals}` : "",
                    v.topIssue ?? "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span role="cell">
                  <button type="button" className="btn btn--sm" onClick={() => open(v)}>
                    Posts →
                  </button>
                </span>
              </div>
            ))}
          </div>
          {all.length === 0 && (
            <p className="f-note">
              No voices yet. TikTok, YouTube and Reddit posts carry who posted; Facebook, X and
              Instagram links usually name the page.
            </p>
          )}
        </div>
      </details>
    </>
  );
}

/** Voices placed by warmth towards the campaign (across) and how often heard (up), sized by views. */
function VoiceMap({ voices, open }: { voices: Voice[]; open: (v: Voice) => void }) {
  const W = 640;
  const H = 300;
  const pad = 34;
  const maxPosts = Math.max(1, ...voices.map((v) => v.posts));
  const maxReach = Math.max(1, ...voices.map((v) => v.reach ?? 0));
  const y = (posts: number) =>
    H - pad - (Math.log(posts) / Math.log(Math.max(2, maxPosts))) * (H - 2 * pad);
  const x = (mood: number | null) => pad + (((mood ?? 0) + 1) / 2) * (W - 2 * pad);
  const r = (reach: number | null) => 4 + (reach ? Math.sqrt(reach / maxReach) * 14 : 0);
  const labelled = new Set(voices.slice(0, 8).map((v) => v.key));
  const shown = [...new Set(voices.map((v) => v.platform))];
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <h2>Voices map</h2>
          <p className="meta">
            Across: angry with you on the left, warm on the right (hollow when no post was read for
            mood). Up: heard more often. Size: views, where counted. Tap a voice for its posts.
          </p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="vx-map" role="img" aria-label="Voices map">
        <line x1={W / 2} x2={W / 2} y1={pad / 2} y2={H - pad} className="vx-axis" />
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className="vx-axis" />
        <text x={pad} y={H - 10} className="vx-lab">
          angry with you
        </text>
        <text x={W - pad} y={H - 10} textAnchor="end" className="vx-lab">
          warm to you
        </text>
        <text x={W / 2 + 6} y={pad / 2 + 8} className="vx-lab">
          heard most
        </text>
        {voices.map((v) => (
          <g
            key={v.key}
            className="vx-dot"
            transform={`translate(${x(v.mood)},${y(v.posts)})`}
            onClick={() => open(v)}
            onKeyDown={(e) => (e.key === "Enter" ? open(v) : undefined)}
            tabIndex={0}
            role="button"
            aria-label={`${v.name}, ${sourceName(v.platform)}, ${v.posts} posts`}
          >
            <title>
              {`${v.name} (${sourceName(v.platform)}): ${v.posts} posts${v.reach ? `, seen ${v.reach.toLocaleString("en-KE")}` : ""}; ${v.positive} warm, ${v.neutral} neutral, ${v.negative} angry`}
            </title>
            <circle
              r={r(v.reach)}
              fill={v.mood === null ? "none" : colour(v.platform)}
              stroke={colour(v.platform)}
              strokeWidth={1.5}
              fillOpacity={0.7}
            />
            {labelled.has(v.key) && (
              <text x={r(v.reach) + 3} y={4} className="vx-name">
                {v.name.slice(0, 22)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="vx-legend">
        {shown.map((p) => (
          <span key={p}>
            <i style={{ background: colour(p) }} aria-hidden="true" /> {sourceName(p)}
          </span>
        ))}
      </p>
    </div>
  );
}
