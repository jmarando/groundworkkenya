// Listening's reactions: what the office decided to do about a post. Each is drafted by the AI
// from the post and the campaign's record (src/lib/rapid.functions.ts), then edited here, copied
// to creators on WhatsApp, or sent to Daraja Pulse for the creators on the campaign's roster.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { QueryState } from "@/components/gw/QueryState";
import { stamp } from "@/lib/format";
import { sourceName } from "@/lib/listening-read";
import { RAPID_RULES, rapidText } from "@/lib/pulse";
import {
  getReactions,
  sendReactionToPulse,
  updateReaction,
  type Reaction,
  type ReactionsData,
} from "@/lib/rapid.functions";

const STATUS: Record<Reaction["status"], { label: string; cls: string }> = {
  drafted: { label: "Drafted", cls: "pill--amber" },
  briefed: { label: "Creators briefed", cls: "pill--ok" },
  done: { label: "Done", cls: "pill--muted" },
  dropped: { label: "Let it go", cls: "pill--muted" },
};

export function Reactions({ openId }: { openId: string | null }) {
  const fetch = useServerFn(getReactions);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reactions"],
    queryFn: () => fetch(),
  });
  return (
    <>
      <QueryState
        isLoading={isLoading}
        isError={isError}
        retry={() => void refetch()}
        what="the reactions"
      />
      {data && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {data.reactions.length === 0 && (
            <div className="card">
              <p className="f-note">
                No reactions yet. Press React on any post (Overview, All posts or Voices) and the AI
                drafts whether to answer, the angle, your own reply and a brief for creators.
              </p>
            </div>
          )}
          {data.reactions.map((r) => (
            <ReactionCard key={r.id} r={r} data={data} open={r.id === openId} />
          ))}
        </div>
      )}
    </>
  );
}

function ReactionCard({ r, data, open }: { r: Reaction; data: ReactionsData; open: boolean }) {
  const qc = useQueryClient();
  const save = useServerFn(updateReaction);
  const send = useServerFn(sendReactionToPulse);
  const [edit, setEdit] = useState({
    angle: r.angle,
    reply: r.reply,
    creatorBrief: r.creatorBrief,
    dos: r.dos.filter((d) => !RAPID_RULES.dos.includes(d)).join("\n"),
    donts: r.donts.filter((d) => !RAPID_RULES.donts.includes(d)).join("\n"),
  });
  const [picked, setPicked] = useState<string[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["reactions"] });
  const saving = useMutation({
    mutationFn: (status?: Reaction["status"]) =>
      save({
        data: {
          id: r.id,
          angle: edit.angle,
          reply: edit.reply,
          creatorBrief: edit.creatorBrief,
          dos: [...edit.dos.split("\n"), ...RAPID_RULES.dos],
          donts: [...edit.donts.split("\n"), ...RAPID_RULES.donts],
          ...(status ? { status } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success("Saved.");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sending = useMutation({
    mutationFn: async () => {
      await saving.mutateAsync(undefined);
      return send({ data: { id: r.id, creatorIds: picked } });
    },
    onSuccess: async () => {
      toast.success("Sent to Daraja Pulse.");
      await refresh();
    },
    onError: async (e: Error) => {
      toast.error(e.message);
      await refresh();
    },
  });
  const text = rapidText({
    post_url: r.postUrl,
    platform: r.platform,
    what_happened: r.whatHappened,
    angle: edit.angle,
    creator_brief: edit.creatorBrief,
    dos: [...edit.dos.split("\n").filter(Boolean), ...RAPID_RULES.dos],
    donts: [...edit.donts.split("\n").filter(Boolean), ...RAPID_RULES.donts],
    respond_by: r.respondBy,
    platforms: r.platform ? [sourceName(r.platform)] : [],
    paid_for_by: "Paid for by the campaign",
  });
  const fits = data.creators.filter(
    (c) => !r.platform || !c.platform || c.platform.toLowerCase() === r.platform,
  );
  const late = r.respondBy && Date.parse(r.respondBy) < Date.now();

  return (
    <details className="card rx-card" open={open || r.status === "drafted"}>
      <summary>
        <span className={`pill ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>{" "}
        {!r.react && <span className="pill pill--muted">AI says: don&apos;t answer</span>}{" "}
        <b>{r.whatHappened.slice(0, 160)}</b>{" "}
        <span className="meta">
          {r.platform ? sourceName(r.platform) : ""} · {stamp(r.createdAt)}
          {r.respondBy
            ? ` · ${late ? "was useful until" : "useful until"} ${stamp(r.respondBy)}`
            : ""}
        </span>
      </summary>
      {r.postUrl && (
        <p className="meta">
          <a href={r.postUrl} target="_blank" rel="noreferrer">
            The post ↗
          </a>
        </p>
      )}
      <div className="rx-grid">
        <label className="auth-field">
          <span>The angle</span>
          <textarea
            rows={3}
            value={edit.angle}
            disabled={!data.canWrite}
            onChange={(e) => setEdit({ ...edit, angle: e.target.value })}
          />
        </label>
        <label className="auth-field">
          <span>Your own reply (your accounts)</span>
          <textarea
            rows={3}
            value={edit.reply}
            disabled={!data.canWrite}
            onChange={(e) => setEdit({ ...edit, reply: e.target.value })}
          />
        </label>
        <label className="auth-field rx-wide">
          <span>Brief for creators</span>
          <textarea
            rows={3}
            value={edit.creatorBrief}
            disabled={!data.canWrite}
            onChange={(e) => setEdit({ ...edit, creatorBrief: e.target.value })}
          />
        </label>
        <label className="auth-field">
          <span>Do (one a line)</span>
          <textarea
            rows={3}
            value={edit.dos}
            disabled={!data.canWrite}
            onChange={(e) => setEdit({ ...edit, dos: e.target.value })}
          />
        </label>
        <label className="auth-field">
          <span>Don&apos;t (one a line)</span>
          <textarea
            rows={3}
            value={edit.donts}
            disabled={!data.canWrite}
            onChange={(e) => setEdit({ ...edit, donts: e.target.value })}
          />
        </label>
      </div>
      <p className="f-note">Always added: {[...RAPID_RULES.dos, ...RAPID_RULES.donts].join(" ")}</p>

      {data.canWrite && fits.length > 0 && (
        <div className="fchips" style={{ margin: "8px 0" }}>
          <span className="meta">Creators on your Pulse roster for this:</span>
          {fits.map((c) => (
            <button
              type="button"
              key={c.id}
              className="fchip"
              aria-pressed={picked.includes(c.id)}
              onClick={() =>
                setPicked(
                  picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id],
                )
              }
            >
              {c.name}
              {c.handle ? ` ${c.handle}` : ""}
              {c.followers ? ` · ${c.followers.toLocaleString("en-KE")}` : ""}
            </button>
          ))}
        </div>
      )}
      {r.pulseDetail && <p className="f-note">{r.pulseDetail}</p>}

      {data.canWrite && (
        <div className="rx-acts">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => toast.success("Brief copied. Paste it to the creators on WhatsApp."))
                .catch(() => toast.error("Couldn't copy; select the text below instead."));
            }}
          >
            Copy brief for WhatsApp
          </button>
          {r.reply && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(edit.reply)
                  .then(() => toast.success("Reply copied."))
                  .catch(() => toast.error("Couldn't copy."));
              }}
            >
              Copy reply
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={sending.isPending || data.pulse !== "connected"}
            title={data.pulse !== "connected" ? "Daraja Pulse isn't connected yet." : undefined}
            onClick={() => sending.mutate()}
          >
            {sending.isPending ? "Sending…" : "Send to Daraja Pulse"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={saving.isPending}
            onClick={() => saving.mutate(undefined)}
          >
            Save edits
          </button>
          {r.status !== "done" && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => saving.mutate("done")}
            >
              Mark done
            </button>
          )}
          {r.status === "drafted" && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => saving.mutate("dropped")}
            >
              Let it go
            </button>
          )}
        </div>
      )}
      <details className="rx-preview">
        <summary className="meta">The brief as creators get it</summary>
        <pre>{text}</pre>
      </details>
    </details>
  );
}
