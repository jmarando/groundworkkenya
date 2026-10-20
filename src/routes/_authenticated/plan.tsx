import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { QueryState } from "@/components/gw/QueryState";
import { bands, liveActions, moveDate, type Move, type Source, type Stance } from "@/lib/brief";
import { getPlan } from "@/lib/brief.functions";
import { saveDiaryEntry } from "@/lib/diary.functions";
import { getFindings } from "@/lib/findings.functions";
import { DECISION_NAMES, DECISIONS, type Finding } from "@/lib/findings/core";
import { shortDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/plan")({
  component: Plan,
  head: () => ({
    meta: [
      { title: "Next two weeks · Groundwork" },
      {
        name: "description",
        content:
          "The political read, what to do day by day for a fortnight, and what the campaign's own records say.",
      },
    ],
  }),
});

const STANCE: Record<Stance, { label: string; cls: string }> = {
  strength: { label: "Strength", cls: "pill--ok" },
  threat: { label: "Threat", cls: "pill--red" },
  opening: { label: "Opening", cls: "pill--amber" },
  context: { label: "Context", cls: "pill--muted" },
};

const days = (m: Pick<Move, "from" | "to">) =>
  m.from === m.to ? `Day ${m.from}` : `Days ${m.from}–${m.to}`;

function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <p className="plan-sources">
      {sources.map((s, i) => (
        <span key={i}>
          {i > 0 ? " · " : "Sources: "}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ) : (
            s.label
          )}
          {s.date ? `, ${shortDay(s.date)}` : ""}
        </span>
      ))}
    </p>
  );
}

const href = (f: Finding) => {
  const q = new URLSearchParams(f.next.search ?? {}).toString();
  return `${f.next.to}${q ? `?${q}` : ""}${f.next.hash ? `#${f.next.hash}` : ""}`;
};

function Plan() {
  const fetchPlan = useServerFn(getPlan);
  const fetchFindings = useServerFn(getFindings);
  const saveEntry = useServerFn(saveDiaryEntry);
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["plan"],
    queryFn: () => fetchPlan(),
  });
  const { data: findings } = useQuery({ queryKey: ["findings"], queryFn: () => fetchFindings() });

  const toDiary = useMutation({
    mutationFn: (m: Move) =>
      saveEntry({
        data: {
          day: moveDate(data!.brief!.startsOn, m),
          title: m.diary?.title ?? m.title,
          kind: m.diary?.kind ?? "visit",
          note: [m.why, m.where.length ? `Where: ${m.where.join(", ")}` : ""]
            .filter(Boolean)
            .join("\n")
            .slice(0, 500),
        },
      }),
    onSuccess: async () => {
      toast.success("In the diary.");
      await qc.invalidateQueries({ queryKey: ["plan"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const brief = data?.brief ?? null;
  const live = data
    ? liveActions({ today: data.today, diary: data.diary, lists: data.lists, wards: data.wards })
    : [];
  const top = DECISIONS.flatMap((d) =>
    (findings?.findings ?? []).filter((f) => f.decision === d).slice(0, 2),
  );
  const booked = new Set((data?.diary ?? []).map((e) => `${e.day}|${e.title}`));

  return (
    <section className="view active plan" aria-label="Next two weeks">
      <div className="vh fx">
        <div>
          <span className="eyebrow">
            Next two weeks
            {brief ? ` · ${shortDay(brief.startsOn)} to ${shortDay(brief.endsOn)}` : ""}
          </span>
          <h1>{brief ? brief.headline : "What to do, day by day."}</h1>
          <p className="meta">
            {brief
              ? `The read and the plan${brief.writtenBy ? ` by ${brief.writtenBy}` : ""}, from public reporting and polls (each linked), then what your own records say. A proposal: the candidate decides.`
              : "No plan has been written for this campaign yet. What your own records say is below."}
          </p>
        </div>
        <div className="vh-side" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/roadmap" className="btn btn--sm">
            Road to election day →
          </Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <QueryState
        isLoading={isLoading}
        isError={isError}
        retry={() => void refetch()}
        what="the plan"
      />

      {brief && brief.read.length > 0 && (
        <>
          <h2 className="plan-h">The read</h2>
          <div className="plan-read">
            {brief.read.map((s, i) => (
              <article className="card plan-card" key={i}>
                <span className={`pill ${STANCE[s.stance].cls}`}>{STANCE[s.stance].label}</span>
                <h3>{s.title}</h3>
                {s.body.split(/\n+/).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
                <Sources sources={s.sources} />
              </article>
            ))}
          </div>
        </>
      )}

      {brief && brief.moves.length > 0 && (
        <>
          <h2 className="plan-h">The two weeks</h2>
          <div className="plan-bands">
            {bands(brief).map((b) => (
              <div className="plan-band" key={b.label}>
                <div className="plan-band-head">
                  <b>{b.label}</b>
                  <span className="mono">
                    {shortDay(b.from)} to {shortDay(b.to)}
                  </span>
                </div>
                {b.moves.length === 0 && (
                  <p className="f-note">Keep going with what is under way.</p>
                )}
                {b.moves.map((m, i) => {
                  const day = moveDate(brief.startsOn, m);
                  const inDiary = booked.has(`${day}|${m.diary?.title ?? m.title}`);
                  return (
                    <article className="card plan-move" key={i}>
                      <span className="mono plan-days">
                        {days(m)} · {shortDay(day)}
                      </span>
                      <h3>{m.title}</h3>
                      {m.why && <p>{m.why}</p>}
                      {m.how.length > 0 && (
                        <ul>
                          {m.how.map((h, j) => (
                            <li key={j}>{h}</li>
                          ))}
                        </ul>
                      )}
                      {m.where.length > 0 && (
                        <p className="plan-where">
                          {m.where.map((w) => (
                            <span className="tag" key={w}>
                              {w}
                            </span>
                          ))}
                        </p>
                      )}
                      {m.measure && (
                        <p className="meta">
                          <b>Measure:</b> {m.measure}
                        </p>
                      )}
                      <Sources sources={m.sources} />
                      {m.diary && data?.canWrite && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={inDiary || toDiary.isPending}
                          onClick={() => toDiary.mutate(m)}
                        >
                          {inDiary ? "In the diary ✓" : `Put in the diary for ${shortDay(day)}`}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="plan-h">What your records say this fortnight</h2>
      <div className="card">
        {live.length === 0 && top.length === 0 && (
          <p className="f-note">Nothing to flag from the diary, walk lists or findings yet.</p>
        )}
        <ol className="lsn-acts">
          {live.map((a) => (
            <li key={a.key} className={`lsn-act lsn-act--${a.tone}`}>
              <div>
                <b>{a.headline}</b>
                <p className="meta">{a.why}</p>
              </div>
              <Link to={a.to} className="btn btn--sm">
                Open →
              </Link>
            </li>
          ))}
          {top.map((f) => (
            <li key={f.id} className="lsn-act lsn-act--watch">
              <div>
                <span className="mono">{DECISION_NAMES[f.decision]}</span>
                <b style={{ display: "block" }}>{f.line}</b>
              </div>
              <a href={href(f)} className="btn btn--sm">
                {f.next.label} →
              </a>
            </li>
          ))}
        </ol>
      </div>

      {data && data.impacts.length > 0 && (
        <>
          <h2 className="plan-h">Wider news, read for this seat</h2>
          <div className="plan-read">
            {data.impacts.map((i) => (
              <article className="card plan-card" key={i.id}>
                <span className={`pill ${STANCE[i.stance].cls}`}>{STANCE[i.stance].label}</span>{" "}
                <span className="tag">{i.scope}</span>
                <h3>{i.title}</h3>
                <p>{i.reading.split(/\n+/)[0]}</p>
                {i.moves.length > 0 && (
                  <ul className="rm-moves">
                    {i.moves.map((m, j) => (
                      <li key={j}>{m}</li>
                    ))}
                  </ul>
                )}
                <Sources sources={i.sources} />
              </article>
            ))}
          </div>
          <p className="f-note">
            <Link to="/roadmap">Every story read for the seat, and the road to election day →</Link>
          </p>
        </>
      )}

      {brief && brief.watch.length > 0 && (
        <>
          <h2 className="plan-h">Watch</h2>
          <div className="card">
            <ul className="plan-watch">
              {brief.watch.map((w, i) => (
                <li key={i}>
                  <b>{w.title}.</b> {w.body}
                  <Sources sources={w.sources} />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="f-note" style={{ marginTop: 18 }}>
        Places, never people: the read speaks of wards, counties and regions as reporting and polls
        describe them, and nothing here records or guesses any person&apos;s community.
      </p>
    </section>
  );
}
