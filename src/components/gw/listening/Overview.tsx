// Listening's overview: what to do this week, every conversation with its mood, where the posts
// were found, and the posts behind any of it (src/lib/listening-read.ts works the figures out).
import { useMemo, useState } from "react";

import type { Mention } from "@/lib/listening.functions";
import {
  actions,
  conversations,
  hasLastWeek,
  postsFor,
  sourceName,
  type Conversation,
  type Focus,
} from "@/lib/listening-read";

const nf = new Intl.NumberFormat("en-KE");

const MOOD: Record<string, { word: string; cls: string }> = {
  positive: { word: "warm", cls: "pill--ok" },
  neutral: { word: "neutral", cls: "pill--muted" },
  negative: { word: "angry", cls: "pill--red" },
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

type Topic = { id: string; label: string; kind: string; active: boolean };
type Mark = (ids: string[], status: "new" | "actioned") => void;

export function Overview({
  topics,
  mentions,
  busy,
  mark,
  openKeywords,
}: {
  topics: Topic[];
  mentions: Mention[];
  busy: boolean;
  mark: Mark;
  openKeywords: () => void;
}) {
  const [focus, setFocus] = useState<Focus | null>(null);
  // A week back from when the posts were loaded; recomputed with each load.
  const now = Date.now();
  const convos = conversations(topics, mentions, now);
  const todo = actions(convos, mentions, now);
  const compare = hasLastWeek(mentions, now);
  const sources = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of mentions) n.set(m.source, (n.get(m.source) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [mentions]);

  if (focus) {
    return (
      <Drill
        focus={focus}
        posts={postsFor(mentions, focus, now)}
        back={() => setFocus(null)}
        busy={busy}
        mark={mark}
      />
    );
  }

  const groups: { key: Conversation["group"]; title: string; note: string }[] = [
    { key: "you", title: "About you", note: "Your name, your party and your own accounts." },
    { key: "rivals", title: "Your rivals", note: "What is said about them, and what they post." },
    { key: "issues", title: "Issues", note: "The subjects you asked us to follow." },
  ];

  return (
    <>
      <div className="card lsn-todo">
        <div className="card-head">
          <div>
            <h2>What to do this week</h2>
            <p className="meta">
              Read from the last seven days of posts. Each opens the posts it counts.
            </p>
          </div>
        </div>
        {todo.length === 0 ? (
          <p className="f-note">Nothing needs you this week. The next sweep may change that.</p>
        ) : (
          <ol className="lsn-acts">
            {todo.map((a) => (
              <li key={a.key} className={`lsn-act lsn-act--${a.tone}`}>
                <div>
                  <b>{a.headline}</b>
                  <p className="meta">{a.why}</p>
                </div>
                <button type="button" className="btn btn--sm" onClick={() => setFocus(a.focus)}>
                  {a.todo} ({a.n}) →
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {groups.map((g) => {
        const rows = convos.filter((c) => c.group === g.key);
        return (
          <div className="card" key={g.key} style={{ marginTop: 14 }}>
            <div className="card-head">
              <div>
                <h2>{g.title}</h2>
                <p className="meta">{g.note}</p>
              </div>
              <span className="mono">this week</span>
            </div>
            {rows.length === 0 ? (
              <p className="f-note">
                Nothing followed here yet.{" "}
                <button type="button" className="btn btn--ghost btn--sm" onClick={openKeywords}>
                  Add a keyword
                </button>
              </p>
            ) : (
              <ul className="lsn-convos">
                {rows.map((c) => (
                  <li key={c.key}>
                    <button type="button" className="lsn-convo" onClick={() => setFocus(c.focus)}>
                      <span className="lsn-convo-name">
                        <b>{c.label}</b>
                        <span className="meta">{convoLine(c)}</span>
                      </span>
                      <span className="lsn-convo-n">
                        <b>{nf.format(c.week)}</b>
                        <span className="meta">{compare ? change(c.week, c.prevWeek) : ""}</span>
                      </span>
                      <MoodBar c={c} />
                      <span className="lsn-go" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Where the posts were found</h2>
            <p className="meta">
              Every post the sweeps have kept, by where it was published. Open one to read them.
            </p>
          </div>
        </div>
        <div className="fchips">
          {sources.map(([s, n]) => (
            <button
              type="button"
              key={s}
              className="fchip"
              onClick={() => setFocus({ label: `Found on ${sourceName(s)}`, source: s })}
            >
              {sourceName(s)} · {nf.format(n)}
            </button>
          ))}
          {sources.length === 0 && <p className="f-note">Nothing swept yet.</p>}
        </div>
      </div>
    </>
  );
}

function convoLine(c: Conversation): string {
  const parts: string[] = [];
  if (c.own) {
    if (c.reach > 0) parts.push(`reached ${nf.format(c.reach)}`);
    if (c.commentsRead > 0)
      parts.push(`${c.commentsNegative} angry of ${c.commentsRead} replies read`);
  } else {
    if (c.unhandledAngry > 0) parts.push(`${c.unhandledAngry} angry, not handled`);
    if (c.topIssue) parts.push(`mostly ${c.topIssue}`);
  }
  if (c.sources.length) parts.push(c.sources.map(sourceName).join(", "));
  return parts.join(" · ") || (c.week === 0 ? "nothing this week" : "");
}

function change(week: number, prev: number): string {
  if (week === prev) return prev === 0 ? "" : "same as last week";
  return `${week > prev ? "+" : ""}${week - prev} on last wk`;
}

function MoodBar({ c }: { c: Conversation }) {
  const rated = c.positive + c.neutral + c.negative;
  if (c.own || rated === 0) return <span className="lsn-mood lsn-mood--none" aria-hidden="true" />;
  const pct = (n: number) => `${(n / rated) * 100}%`;
  return (
    <span
      className="lsn-mood"
      role="img"
      aria-label={`${c.positive} warm, ${c.neutral} neutral, ${c.negative} angry`}
      title={`${c.positive} warm · ${c.neutral} neutral · ${c.negative} angry`}
    >
      <i className="w" style={{ width: pct(c.positive) }} />
      <i className="n" style={{ width: pct(c.neutral) }} />
      <i className="a" style={{ width: pct(c.negative) }} />
    </span>
  );
}

function Drill({
  focus,
  posts,
  back,
  busy,
  mark,
}: {
  focus: Focus;
  posts: Mention[];
  back: () => void;
  busy: boolean;
  mark: Mark;
}) {
  const [mood, setMood] = useState("all");
  const shown = mood === "all" ? posts : posts.filter((p) => (p.sentiment ?? "unrated") === mood);
  const count = (m: string) => posts.filter((p) => (p.sentiment ?? "unrated") === m).length;
  const open = shown.filter((p) => p.status === "new").map((p) => p.id);
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={back}>
            ← Overview
          </button>
          <h2 style={{ marginTop: 8 }}>{focus.label}</h2>
          <p className="meta">
            {nf.format(posts.length)} {posts.length === 1 ? "post" : "posts"}, newest first. Open
            the original to read it in full.
          </p>
        </div>
        {open.length > 0 && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => mark(open.slice(0, 200), "actioned")}
          >
            Mark {open.length} handled
          </button>
        )}
      </div>
      <div className="fchips" style={{ marginBottom: 6 }}>
        {[
          ["all", "All", posts.length],
          ["negative", "Angry", count("negative")],
          ["neutral", "Neutral", count("neutral")],
          ["positive", "Warm", count("positive")],
          ["unrated", "Not read yet", count("unrated")],
        ]
          .filter(([k, , n]) => k === "all" || (n as number) > 0)
          .map(([k, label, n]) => (
            <button
              type="button"
              key={k as string}
              className="fchip"
              aria-pressed={mood === k}
              onClick={() => setMood(k as string)}
            >
              {label} · {n}
            </button>
          ))}
      </div>
      <PostList posts={shown} busy={busy} mark={mark} />
    </div>
  );
}

export function PostList({ posts, busy, mark }: { posts: Mention[]; busy: boolean; mark: Mark }) {
  const [limit, setLimit] = useState(40);
  if (posts.length === 0) return <p className="f-note">No posts here.</p>;
  return (
    <>
      <ul className="lsn-posts">
        {posts.slice(0, limit).map((m) => (
          <li key={m.id} className="lsn-post">
            <div className="lsn-post-meta">
              <span className="tag">{sourceName(m.source)}</span>
              <span>
                {m.rival ? (m.rivalIsUs ? "Your account" : m.rival) : (m.author ?? m.domain ?? "")}
              </span>
              <span className="mono">
                {m.publishedAt ? `posted ${when(m.publishedAt)}` : `found ${when(m.foundAt)}`}
              </span>
            </div>
            <a href={m.url} target="_blank" rel="noreferrer" className="lsn-post-title">
              {(m.title ?? m.url).split("\n")[0]} ↗
            </a>
            {m.snippet && <p className="lsn-post-text">{m.snippet}</p>}
            <div className="lsn-post-foot">
              {m.sentiment && MOOD[m.sentiment] ? (
                <span className={`pill ${MOOD[m.sentiment]!.cls}`}>{MOOD[m.sentiment]!.word}</span>
              ) : (
                <span className="pill pill--muted">not read yet</span>
              )}
              {m.issue && <span className="tag">{m.issue}</span>}
              {m.topic && <span className="meta">found by “{m.topic}”</span>}
              {m.reach !== null && <span className="meta">reach {nf.format(m.reach)}</span>}
              {m.commentsRead ? (
                <span className="meta">
                  {m.commentsRead} replies read: {m.commentsPositive ?? 0} warm,{" "}
                  {m.commentsNegative ?? 0} angry
                </span>
              ) : null}
              <button
                type="button"
                className="btn btn--ghost btn--sm lsn-post-mark"
                disabled={busy}
                onClick={() => mark([m.id], m.status === "new" ? "actioned" : "new")}
              >
                {m.status === "new" ? "Mark handled" : "Handled ✓ (reopen)"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {posts.length > limit && (
        <button type="button" className="btn btn--sm" onClick={() => setLimit(limit + 40)}>
          Show {Math.min(40, posts.length - limit)} more of {posts.length - limit}
        </button>
      )}
    </>
  );
}
