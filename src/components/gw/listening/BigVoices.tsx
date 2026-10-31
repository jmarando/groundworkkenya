// Listening's big voices: who is loud in your seat, your county and the country, how big, for or
// against you, and the move to suggest. Worked out in src/lib/big-voices.ts; this only shows it.
// Places, never people: only public accounts with a real following are named, and a voice is only
// what it published. Pure; the data comes from BigVoicesPanel.
import { useState } from "react";

import {
  focusColumns,
  type BigVoice,
  type BriefFocus,
  type Column,
  type Level,
  type Move,
} from "@/lib/big-voices";
import type { BigVoicesData } from "@/lib/big-voices.functions";
import { nf, shortDay, short } from "@/lib/format";
import { sourceName } from "@/lib/listening-read";
import { APPROACH_LABEL, type ApproachStatus } from "@/lib/outreach";

const MOVE: Record<Move, { label: string; why: string; cls: string }> = {
  recruit: { label: "Recruit", why: "Mostly warm towards you, and active", cls: "pill--ok" },
  respond: {
    label: "Respond",
    why: "Mostly angry: answer the claim, not the person",
    cls: "pill--amber",
  },
  "win-over": { label: "Win over", why: "Big, but not yet for or against you", cls: "pill--muted" },
  press: {
    label: "Press",
    why: "An outlet: send it a note, not a creator brief",
    cls: "pill--muted",
  },
};

const LEVEL_NOTE: Record<Level, string> = {
  seat: "Found by keywords about you, your rivals and local issues",
  county: "Found by your county news keywords",
  country: "Found by your national keywords",
};

/** Where a level is, in the words of a sentence about it. */
const LEVEL_WORD: Record<Level, string> = {
  seat: "your seat",
  county: "your county",
  country: "the country",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, one: string) => `${nf.format(n)} ${n === 1 ? one : `${one}s`}`;

function Mood({ v }: { v: BigVoice }) {
  if (v.read === 0 || v.towardsWarm === null || v.towardsAngry === null)
    return <span className="meta">mood not read</span>;
  const neutral = Math.max(0, 1 - v.towardsWarm - v.towardsAngry);
  return (
    <>
      <span
        className="lsn-mood"
        role="img"
        aria-label={`${v.warm} warm, ${v.read - v.warm - v.angry} neutral, ${v.angry} angry`}
      >
        <i className="w" style={{ width: `${v.towardsWarm * 100}%` }} />
        <i className="n" style={{ width: `${neutral * 100}%` }} />
        <i className="a" style={{ width: `${v.towardsAngry * 100}%` }} />
      </span>
      <span className="meta">
        {pct(v.towardsWarm)} warm · {pct(v.towardsAngry)} angry
      </span>
    </>
  );
}

function VoiceRow({
  v,
  approach,
  open,
  brief,
  react,
}: {
  v: BigVoice;
  approach?: { status: string; at: string } | undefined;
  open: (v: BigVoice) => void;
  brief?: (v: BigVoice) => void;
  react?: (mentionId: string) => void;
}) {
  const move = MOVE[v.move];
  const size = [
    v.kind === "account" && v.followers !== null ? `${short(v.followers)} followers` : null,
    plural(v.posts, "post"),
    v.seen !== null ? `seen ${short(v.seen)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="bv-row">
      <div className="bv-name">
        <button type="button" className="linklike" onClick={() => open(v)}>
          {v.name}
        </button>
        <span className="meta">{sourceName(v.platform)}</span>
        {v.url && (
          <a
            href={v.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${v.name} on ${sourceName(v.platform)}, opens in a new tab`}
          >
            ↗
          </a>
        )}
      </div>
      <p className="meta">
        {size}
        {v.topIssues.length > 0 ? ` · ${v.topIssues.join(", ")}` : ""}
      </p>
      <p className="bv-mood">
        <Mood v={v} />
      </p>
      <div className="bv-act">
        <span className={`pill ${move.cls}`} title={move.why}>
          {move.label}
        </span>
        {v.move === "respond" && v.angryPostId && react && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => react(v.angryPostId as string)}
          >
            Reply
          </button>
        )}
        {v.kind === "account" && brief && (
          <button type="button" className="btn btn--sm" onClick={() => brief(v)}>
            {approach ? "Brief again" : "Brief"}
          </button>
        )}
        {approach && (
          <span className="meta">
            {APPROACH_LABEL[approach.status as ApproachStatus] ?? "Approached"}{" "}
            {shortDay(approach.at)}
          </span>
        )}
      </div>
    </li>
  );
}

function ColumnView({
  col,
  approaches,
  open,
  brief,
  react,
}: {
  col: Column;
  approaches: BigVoicesData["approaches"];
  open: (v: BigVoice) => void;
  brief?: (v: BigVoice, level: Level) => void;
  react?: (mentionId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const accounts = all ? col.accounts : col.accounts.slice(0, 3);
  const outlets = all ? col.outlets : col.outlets.slice(0, 1);
  const hidden = col.accounts.length - accounts.length + (col.outlets.length - outlets.length);
  return (
    <section className="bv-col" aria-label={col.label}>
      <h3>{col.label}</h3>
      <p className="meta">{LEVEL_NOTE[col.level]}</p>
      {accounts.length + outlets.length === 0 && (
        <p className="f-note">No account here is big enough to name yet.</p>
      )}
      <ol className="bv-list">
        {[...accounts, ...outlets].map((v) => (
          <VoiceRow
            key={v.key}
            v={v}
            approach={approaches[v.key]}
            open={open}
            {...(brief ? { brief: (x: BigVoice) => brief(x, col.level) } : {})}
            {...(react ? { react } : {})}
          />
        ))}
      </ol>
      {hidden > 0 && (
        <button type="button" className="linklike" onClick={() => setAll(true)}>
          See {hidden} more
        </button>
      )}
      {all && col.accounts.length + col.outlets.length > 4 && (
        <button type="button" className="linklike" onClick={() => setAll(false)}>
          Show fewer
        </button>
      )}
      {col.smaller > 0 && (
        <p className="meta">{plural(col.smaller, "post")} from smaller accounts</p>
      )}
    </section>
  );
}

export function BigVoicesView({
  data,
  open,
  brief,
  react,
  focus,
  clearFocus,
}: {
  data: BigVoicesData;
  open: (v: BigVoice) => void;
  /** Present when the caller may brief a voice. */
  brief?: (v: BigVoice, level: Level) => void;
  /** Drafts a reaction to a post. */
  react?: (mentionId: string) => void;
  /** A story's Brief voices: one column, its recruit voices on the story's issue. */
  focus?: BriefFocus;
  /** Back to every column. */
  clearFocus?: () => void;
}) {
  // With a focus a column shows only if someone fits it; otherwise the screen says none does.
  const columns = focus
    ? focusColumns(data.columns, focus).filter((c) => c.accounts.length > 0)
    : data.columns;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <h2>Big voices</h2>
          <p className="meta">
            The accounts and outlets with the widest reach in your seat, your county and the
            country, and how their posts feel towards you. Only public accounts with a real
            following are named. Tap a name for its posts.
          </p>
        </div>
      </div>
      {focus && (
        <p className="f-note" role="status">
          <span>
            {`Showing recruit voices in ${LEVEL_WORD[focus.level]}${focus.issue ? ` who posted about ${focus.issue}` : ""}.`}
          </span>{" "}
          {clearFocus && (
            <button type="button" className="linklike" onClick={clearFocus}>
              Show all voices
            </button>
          )}
        </p>
      )}
      {focus && columns.length === 0 ? (
        <p className="f-note">
          {`No recruit voice in ${LEVEL_WORD[focus.level]} ${focus.issue ? `has posted about ${focus.issue} ` : ""}in the last ${data.days} days.`}
        </p>
      ) : columns.length === 0 ? (
        <p className="f-note">
          No big voices yet. They appear as the sweeps find posts from accounts and outlets with a
          real audience, and as follower counts are looked up.
        </p>
      ) : (
        <div className="bv-cols">
          {columns.map((c) => (
            <ColumnView
              key={c.level}
              col={c}
              approaches={data.approaches}
              open={open}
              {...(brief && data.canBrief ? { brief } : {})}
              {...(react ? { react } : {})}
            />
          ))}
        </div>
      )}
      {data.truncated && (
        <p className="f-note">
          There were more posts than could be read for these days, so the newest are counted.
        </p>
      )}
    </div>
  );
}
