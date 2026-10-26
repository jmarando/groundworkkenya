// Listening's overview, kept short: what needs you, then what is being said, and the posts behind
// any line (src/lib/listening-read.ts works the figures out). No week-on-week comparisons and no
// mood bars here: the posts, their moods and their sources are one tap away.
import { useState } from "react";

import type { Mention } from "@/lib/listening.functions";
import {
  actions,
  conversations,
  postsFor,
  sourceName,
  type Conversation,
  type Focus,
} from "@/lib/listening-read";
import { nf } from "@/lib/format";
import { spreading, voiceOf, SPREAD_DEFAULT } from "@/lib/voices";

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
/** Opens a reaction to a post; absent where the caller can't react. */
export type React = ((mentionId: string) => void) | undefined;

/** Actions shown before "Show more": the few that matter most, most pressing first. */
const FIRST = 3;

export function Overview({
  topics,
  mentions,
  busy,
  mark,
  openKeywords,
  react,
  threshold = SPREAD_DEFAULT,
}: {
  topics: Topic[];
  mentions: Mention[];
  busy: boolean;
  mark: Mark;
  openKeywords: () => void;
  react?: React;
  /** Views a post needs to count as spreading. */
  threshold?: number;
}) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [allActions, setAllActions] = useState(false);
  // A week back from when the posts were loaded; recomputed with each load.
  const now = Date.now();
  const convos = conversations(topics, mentions, now);
  const todo = actions(convos, mentions, now);

  if (focus) {
    return (
      <Drill
        focus={focus}
        posts={postsFor(mentions, focus, now)}
        back={() => setFocus(null)}
        busy={busy}
        mark={mark}
        react={react}
      />
    );
  }
  const spread = spreading(mentions, threshold, now);
  const shown = allActions ? todo : todo.slice(0, FIRST);

  const groups: { key: Conversation["group"]; title: string }[] = [
    { key: "you", title: "About you" },
    { key: "rivals", title: "Your rivals" },
    { key: "issues", title: "Issues" },
    { key: "wider", title: "County and national news" },
  ];

  return (
    <>
      {spread.length > 0 && (
        <div className="card lsn-spread lsn-spread--on">
          <div className="card-head">
            <div>
              <h2>Spreading now</h2>
              <p className="meta">
                Posts from the last two days seen at least {nf.format(threshold)} times.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setFocus({ label: "Spreading now", ids: spread.map((p) => p.id) })}
            >
              All {spread.length} →
            </button>
          </div>
          <ol className="lsn-acts">
            {spread.slice(0, 4).map((p) => (
              <li
                key={p.id}
                className={`lsn-act lsn-act--${p.sentiment === "negative" ? "urgent" : "watch"}`}
              >
                <div>
                  <b>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {(p.title ?? p.url).split("\n")[0]!.slice(0, 140)} ↗
                    </a>
                  </b>
                  <p className="meta">
                    {sourceName(p.source)} · {voiceOf(p)?.name ?? "unknown account"} · seen{" "}
                    {nf.format(p.reach ?? 0)}
                    {p.sentiment ? ` · ${MOOD[p.sentiment]?.word ?? p.sentiment}` : ""}
                    {p.status !== "new" ? " · handled" : ""}
                  </p>
                </div>
                {react && (
                  <button type="button" className="btn btn--sm" onClick={() => react(p.id)}>
                    React →
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="card lsn-todo" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Needs you</h2>
            <p className="meta">From the last seven days of posts.</p>
          </div>
        </div>
        {todo.length === 0 ? (
          <p className="f-note">
            {mentions.length === 0
              ? "Nothing has been swept yet. Posts appear here after the next sweep."
              : "Nothing needs you this week. The next sweep may change that."}
          </p>
        ) : (
          <>
            <ol className="lsn-acts">
              {shown.map((a) => (
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
            {todo.length > FIRST && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ marginTop: 10 }}
                onClick={() => setAllActions(!allActions)}
              >
                {allActions ? "Show fewer" : `Show ${todo.length - FIRST} more`}
              </button>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>What is being said</h2>
            <p className="meta">This week. Open a line to read the posts behind it.</p>
          </div>
        </div>
        {convos.length === 0 ? (
          <p className="f-note">
            Nothing followed yet.{" "}
            <button type="button" className="btn btn--ghost btn--sm" onClick={openKeywords}>
              Add a keyword
            </button>
          </p>
        ) : (
          groups.map((g) => {
            const rows = convos.filter((c) => c.group === g.key);
            if (rows.length === 0) return null;
            return (
              <section className="lsn-group" key={g.key}>
                <h3 className="lsn-group-title">{g.title}</h3>
                <ul className="lsn-convos">
                  {rows.map((c) => (
                    <li key={c.key}>
                      <button type="button" className="lsn-convo" onClick={() => setFocus(c.focus)}>
                        <span className="lsn-convo-name">
                          <span className="lsn-convo-title">
                            <b>{c.label}</b>
                            {!c.own && c.unhandledAngry > 0 ? (
                              <span
                                className="pill pill--red"
                                title="Angry posts nobody has handled yet"
                              >
                                {c.unhandledAngry} angry
                              </span>
                            ) : null}
                          </span>
                          <span className="meta">{convoLine(c)}</span>
                        </span>
                        <span className="lsn-convo-n">
                          <b>{nf.format(c.week)}</b>
                        </span>
                        <span className="lsn-go" aria-hidden="true">
                          →
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
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
  } else if (c.topIssue) {
    parts.push(`mostly ${c.topIssue}`);
  }
  if (c.sources.length) parts.push(c.sources.map(sourceName).join(", "));
  return parts.join(" · ") || (c.week === 0 ? "nothing this week" : "");
}

export function Drill({
  focus,
  posts,
  back,
  busy,
  mark,
  react,
}: {
  focus: Focus;
  posts: Mention[];
  back: () => void;
  busy: boolean;
  mark: Mark;
  react?: React;
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
      <PostList posts={shown} busy={busy} mark={mark} react={react} />
    </div>
  );
}

export function PostList({
  posts,
  busy,
  mark,
  react,
}: {
  posts: Mention[];
  busy: boolean;
  mark: Mark;
  react?: React;
}) {
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
                {m.rival
                  ? m.rivalIsUs
                    ? "Your account"
                    : m.rival
                  : (voiceOf(m)?.name ?? m.domain ?? "")}
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
              {m.reach !== null && <span className="meta">seen {nf.format(m.reach)}</span>}
              {m.shares ? <span className="meta">shared {nf.format(m.shares)}</span> : null}
              {m.commentsRead ? (
                <span className="meta">
                  {m.commentsRead} replies read: {m.commentsPositive ?? 0} warm,{" "}
                  {m.commentsNegative ?? 0} angry
                </span>
              ) : null}
              {react && !m.rivalIsUs && (
                <button type="button" className="btn btn--sm" onClick={() => react(m.id)}>
                  React
                </button>
              )}
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
