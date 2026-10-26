import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { QueryState } from "@/components/gw/QueryState";
import type { Source, Stance } from "@/lib/brief";
import { keyDates, RALLY_RULE, type Sureness } from "@/lib/election-calendar";
import { shortDay } from "@/lib/format";
import { currentPhase, streamName, WORKSTREAMS, type Milestone, type Phase } from "@/lib/roadmap";
import {
  addRoadmapNote,
  draftRoadmap,
  getRoadmap,
  readStory,
  removeRoadmapNote,
  setRoadmapItem,
  unreadWiderNews,
  type RoadmapData,
} from "@/lib/roadmap.functions";

export const Route = createFileRoute("/_authenticated/roadmap")({
  component: Roadmap,
  head: () => ({
    meta: [
      { title: "Road to election day · Groundwork" },
      {
        name: "description",
        content:
          "The campaign's plan from today to polling day: IEBC's dates, where the gaps are, each phase's milestones, wider news read for the seat and the team's notes.",
      },
    ],
  }),
});

const STANCE: Record<Stance, { label: string; cls: string }> = {
  strength: { label: "Helps", cls: "pill--ok" },
  threat: { label: "Hurts", cls: "pill--red" },
  opening: { label: "Opening", cls: "pill--amber" },
  context: { label: "Context", cls: "pill--muted" },
};
const SURE: Record<Sureness, { label: string; cls: string }> = {
  confirmed: { label: "IEBC", cls: "pill--ok" },
  law: { label: "The law", cls: "pill--muted" },
  precedent: { label: "Not yet set", cls: "pill--amber" },
};
const STATUS: { key: string; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "Under way" },
  { key: "done", label: "Done" },
  { key: "dropped", label: "Dropped" },
];

function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <p className="plan-sources">
      {sources.map((s, i) => (
        <span key={i}>
          {i > 0 ? " · " : "Source: "}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ) : (
            s.label
          )}
        </span>
      ))}
    </p>
  );
}

function Roadmap() {
  const fetchRoadmap = useServerFn(getRoadmap);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["roadmap"],
    queryFn: () => fetchRoadmap(),
  });

  return (
    <section className="view active plan" aria-label="Road to election day">
      <QueryState
        isLoading={isLoading}
        isError={isError}
        retry={() => void refetch()}
        what="the road to election day"
      />
      {data && <Body data={data} />}
    </section>
  );
}

/** Seconds since `on` turned true, ticking while it stays true. */
function useSeconds(on: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!on) return;
    const started = Date.now();
    setSeconds(0);
    const t = window.setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return seconds;
}

function Body({ data }: { data: RoadmapData }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["roadmap"] });
  const draft = useServerFn(draftRoadmap);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const drafting = useMutation({
    mutationFn: () => draft({ data: { ask } }),
    onSuccess: async (out) => {
      const kept = out.kept ?? [];
      toast.success(
        kept.length
          ? `A new draft is in. The AI couldn't write ${kept.join(" and ")} this time, so ${kept.length === 1 ? "that phase keeps" : "those phases keep"} the starting plan.`
          : "A new draft is in. The last one stays on record.",
      );
      setAsk("");
      setAsking(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const seconds = useSeconds(drafting.isPending);

  const r = data.roadmap;
  const now = currentPhase(r, data.today);
  const dates = keyDates(data.level);
  const done = Object.values(data.items).filter((i) => i.status === "done").length;
  const total = r.phases.reduce((t, p) => t + p.milestones.length, 0);

  return (
    <>
      <div className="vh fx">
        <div>
          <span className="eyebrow">
            Road to election day · {data.daysLeft} days to Tuesday 10 August 2027 · {data.seat}
          </span>
          <h1>{r.headline}</h1>
          <p className="meta">
            {r.summary}{" "}
            {data.drafted
              ? `${r.writtenBy ?? "Drafted"}, ${shortDay(r.createdAt!.slice(0, 10))}; ${data.drafts} ${data.drafts === 1 ? "draft" : "drafts"} on record.`
              : ""}{" "}
            {done} of {total} milestones done.
          </p>
        </div>
        <div className="vh-side" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/plan" className="btn btn--sm">
            The next two weeks →
          </Link>
          {data.canWrite && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setAsking(!asking)}
            >
              {data.drafted ? "Redraft with AI" : "Draft with AI"}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {asking && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16 }}>Draft the road with AI</h2>
          <p className="meta">
            The draft reads your gaps, IEBC&apos;s dates, the latest two-week brief, the stories
            already read for this seat, every note below, the last draft and three months of what
            Listening kept. It takes a minute or so. The last draft stays on record.
          </p>
          <label className="auth-field">
            <span>Anything this draft should weigh (optional)</span>
            <textarea
              rows={3}
              value={ask}
              maxLength={1500}
              placeholder="e.g. We are leaning towards running on the DCP ticket; the youth vote in the east is the gap."
              onChange={(e) => setAsk(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={drafting.isPending}
            onClick={() => drafting.mutate()}
          >
            {drafting.isPending ? `Drafting… ${seconds} s` : "Write the draft"}
          </button>
          {drafting.isError && !drafting.isPending ? (
            <p className="f-note" role="alert" style={{ marginTop: 10 }}>
              {drafting.error.message}
            </p>
          ) : null}
        </div>
      )}

      <h2 className="plan-h">Where the gaps are</h2>
      <div className="card">
        <ol className="lsn-acts">
          {data.gaps.map((g) => (
            <li key={g.key} className={`lsn-act lsn-act--${g.tone}`}>
              <div>
                <span className="mono">{streamName(g.workstream)}</span>
                <b style={{ display: "block" }}>{g.headline}</b>
                <p className="meta">{g.why}</p>
              </div>
            </li>
          ))}
        </ol>
        {data.gaps.length === 0 && <p className="f-note">No figures on file yet.</p>}
      </div>

      <h2 className="plan-h">The dates that shape it</h2>
      <div className="card">
        <ol className="rm-dates">
          {dates.map((d) => (
            <li
              key={d.key}
              className={d.on < data.today && (d.until ?? d.on) < data.today ? "past" : ""}
            >
              <span className="mono rm-when">
                {shortDay(d.on)}
                {d.until ? ` – ${shortDay(d.until)}` : ""}
              </span>
              <div>
                <b>{d.title}</b>{" "}
                <span className={`pill ${SURE[d.sureness].cls}`}>{SURE[d.sureness].label}</span>
                <p className="meta">{d.means}</p>
                <Sources sources={d.sources} />
              </div>
            </li>
          ))}
        </ol>
        <p className="f-note">All year: {RALLY_RULE.text}</p>
        <Sources sources={RALLY_RULE.sources} />
      </div>

      <h2 className="plan-h">Phase by phase</h2>
      <div className="rm-phases">
        {r.phases.map((p) => (
          <PhaseCard
            key={p.key}
            phase={p}
            open={p.key === now?.key}
            data={data}
            refresh={refresh}
          />
        ))}
      </div>

      <WiderNews data={data} refresh={refresh} />
      <Notes data={data} refresh={refresh} />

      <p className="f-note" style={{ marginTop: 18 }}>
        How the drafts learn: nothing is trained on your data. Every story Listening keeps (three
        years of it), every reading of wider news, every brief, note and draft stays on record, and
        each new draft is given that record to read. Places, never people: the plan speaks of wards,
        counties and regions, and nothing here records or guesses any person&apos;s community.
      </p>
    </>
  );
}

function PhaseCard({
  phase,
  open,
  data,
  refresh,
}: {
  phase: Phase;
  open: boolean;
  data: RoadmapData;
  refresh: () => Promise<void>;
}) {
  const done = phase.milestones.filter((m) => data.items[m.key]?.status === "done").length;
  const byStream = WORKSTREAMS.map((w) => ({
    ...w,
    ms: phase.milestones.filter((m) => m.workstream === w.key),
  })).filter((w) => w.ms.length);
  return (
    <details className="card rm-phase" open={open}>
      <summary>
        <span className="mono plan-days">
          {shortDay(phase.from)} to {shortDay(phase.to)}
          {open ? " · now" : ""}
        </span>
        <b>{phase.title}</b>
        <span className="meta">
          {done} of {phase.milestones.length} done
        </span>
      </summary>
      <p className="rm-focus">{phase.focus}</p>
      {byStream.map((w) => (
        <div key={w.key} className="rm-stream">
          <h3>{w.name}</h3>
          {w.ms.map((m) => (
            <MilestoneRow key={m.key} m={m} data={data} refresh={refresh} />
          ))}
        </div>
      ))}
    </details>
  );
}

function MilestoneRow({
  m,
  data,
  refresh,
}: {
  m: Milestone;
  data: RoadmapData;
  refresh: () => Promise<void>;
}) {
  const save = useServerFn(setRoadmapItem);
  const item = data.items[m.key];
  const [owner, setOwner] = useState(item?.owner ?? "");
  const mark = useMutation({
    mutationFn: (v: { status: string; owner: string }) =>
      save({ data: { key: m.key, status: v.status, owner: v.owner } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const status = item?.status ?? "todo";
  return (
    <article className={`plan-move rm-ms rm-ms--${status}`}>
      <div className="rm-ms-head">
        <h4>{m.title}</h4>
        {m.by && <span className="mono plan-days">by {shortDay(m.by)}</span>}
      </div>
      {m.why && <p>{m.why}</p>}
      {m.how.length > 0 && (
        <ul>
          {m.how.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      {m.measure && (
        <p className="meta">
          <b>Measure:</b> {m.measure}
        </p>
      )}
      <div className="rm-ms-act">
        <select
          aria-label={`Status of ${m.title}`}
          value={status}
          disabled={mark.isPending}
          onChange={(e) => mark.mutate({ status: e.target.value, owner })}
        >
          {STATUS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          aria-label={`Who owns ${m.title}`}
          placeholder="Who owns it"
          value={owner}
          maxLength={80}
          onChange={(e) => setOwner(e.target.value)}
          onBlur={() => {
            if (owner !== (item?.owner ?? "")) mark.mutate({ status, owner });
          }}
        />
      </div>
    </article>
  );
}

function WiderNews({ data, refresh }: { data: RoadmapData; refresh: () => Promise<void> }) {
  const read = useServerFn(readStory);
  const fetchUnread = useServerFn(unreadWiderNews);
  const { data: unread, refetch } = useQuery({
    queryKey: ["wider-news"],
    queryFn: () => fetchUnread(),
    enabled: data.canWrite,
  });
  const empty = { title: "", url: "", publishedOn: "", text: "" };
  const [form, setForm] = useState(empty);
  const reading = useMutation({
    mutationFn: (v: {
      title: string;
      url?: string | null;
      publishedOn?: string | null;
      text?: string;
      mentionId?: string | null;
    }) => read({ data: v }),
    onSuccess: async () => {
      toast.success("Read for this seat.");
      setForm(empty);
      await Promise.all([refresh(), refetch()]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <h2 className="plan-h" id="news">
        Wider news, read for this seat
      </h2>
      <p className="meta" style={{ marginTop: -4 }}>
        National and county stories move local votes. Each is read for this seat: who it helps here,
        and what to do in the next fortnight.
      </p>
      <div className="plan-read">
        {data.impacts.map((i) => (
          <article className="card plan-card" key={i.id}>
            <span className={`pill ${STANCE[i.stance].cls}`}>{STANCE[i.stance].label}</span>{" "}
            <span className="tag">{i.scope}</span>
            <h3>
              {i.url ? (
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.title} ↗
                </a>
              ) : (
                i.title
              )}
            </h3>
            {i.reading.split(/\n+/).map((p, j) => (
              <p key={j}>{p}</p>
            ))}
            {i.moves.length > 0 && (
              <ul className="rm-moves">
                {i.moves.map((m, j) => (
                  <li key={j}>{m}</li>
                ))}
              </ul>
            )}
            <p className="plan-sources">
              {i.writtenBy ?? "Read"}
              {i.publishedOn ? ` · story of ${shortDay(i.publishedOn)}` : ""}
            </p>
            <Sources sources={i.sources.filter((s) => s.url !== i.url)} />
          </article>
        ))}
        {data.impacts.length === 0 && (
          <p className="f-note">No wider story has been read for this seat yet.</p>
        )}
      </div>

      {data.canWrite && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Read a story for this seat</h3>
          {unread && unread.stories.length > 0 && (
            <>
              <p className="meta">Found by your national and county keywords, not yet read:</p>
              <ul className="rm-unread">
                {unread.stories.map((s) => (
                  <li key={s.id}>
                    <span>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}{" "}
                      <span className="meta">
                        {shortDay(s.publishedOn)} · {s.topic}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={reading.isPending}
                      onClick={() =>
                        reading.mutate({
                          title: s.title,
                          url: s.url,
                          publishedOn: s.publishedOn,
                          text: s.snippet ?? "",
                          mentionId: s.id,
                        })
                      }
                    >
                      Read for this seat
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {unread && unread.topics === 0 && (
            <p className="meta">
              Add national and county keywords in <Link to="/listening">Listening → Keywords</Link>{" "}
              (for example the president&apos;s name, the parties, your county) and their stories
              will wait here to be read.
            </p>
          )}
          <div className="rm-form">
            <label className="auth-field">
              <span>Headline</span>
              <input
                value={form.title}
                maxLength={300}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="auth-field">
              <span>Link (https)</span>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </label>
            <label className="auth-field">
              <span>Date</span>
              <input
                type="date"
                value={form.publishedOn}
                onChange={(e) => setForm({ ...form, publishedOn: e.target.value })}
              />
            </label>
            <label className="auth-field rm-wide">
              <span>What it says (paste the key paragraphs)</span>
              <textarea
                rows={3}
                maxLength={3000}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!form.title.trim() || reading.isPending}
            onClick={() =>
              reading.mutate({
                title: form.title,
                url: form.url || null,
                publishedOn: form.publishedOn || null,
                text: form.text,
              })
            }
          >
            {reading.isPending ? "Reading…" : "Read it for this seat"}
          </button>
        </div>
      )}
    </>
  );
}

function Notes({ data, refresh }: { data: RoadmapData; refresh: () => Promise<void> }) {
  const add = useServerFn(addRoadmapNote);
  const remove = useServerFn(removeRoadmapNote);
  const [stream, setStream] = useState("general");
  const [body, setBody] = useState("");
  const adding = useMutation({
    mutationFn: () => add({ data: { workstream: stream, body } }),
    onSuccess: async () => {
      setBody("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removing = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const groups = ["general", ...WORKSTREAMS.map((w) => w.key)]
    .map((k) => ({ key: k, notes: data.notes.filter((n) => n.workstream === k) }))
    .filter((g) => g.notes.length);
  return (
    <>
      <h2 className="plan-h">The strategy session</h2>
      <div className="card">
        <p className="meta" style={{ marginTop: 0 }}>
          The managers&apos; and candidate&apos;s notes: decisions, what you know that the records
          don&apos;t, what to change. Each is signed, and every AI draft reads them.
        </p>
        <div className="rm-note-form">
          <select
            aria-label="Workstream"
            value={stream}
            onChange={(e) => setStream(e.target.value)}
          >
            <option value="general">The whole plan</option>
            {WORKSTREAMS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.name}
              </option>
            ))}
          </select>
          <textarea
            aria-label="Note"
            rows={2}
            maxLength={2000}
            value={body}
            placeholder="e.g. The bishop in Komothai will host us after the harvest; agents for the east come from the dairy co-op."
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!body.trim() || adding.isPending}
            onClick={() => adding.mutate()}
          >
            Add note
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.key} className="rm-stream">
            <h3>{g.key === "general" ? "The whole plan" : streamName(g.key)}</h3>
            <ul className="rm-notes">
              {g.notes.map((n) => (
                <li key={n.id}>
                  <p>{n.body}</p>
                  <span className="meta">
                    {n.authorName ?? "Someone"} · {shortDay(n.createdAt.slice(0, 10))}
                    {n.mine && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={removing.isPending}
                        onClick={() => removing.mutate(n.id)}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && <p className="f-note">No notes yet.</p>}
      </div>
    </>
  );
}
