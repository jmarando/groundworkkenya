import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import {
  deleteAlert,
  deleteTopic,
  getListening,
  resumeListening,
  saveAlert,
  saveTopic,
  setMentionStatus,
  sweepListening,
  testAlert,
  toggleAlert,
  toggleTopic,
} from "@/lib/listening.functions";
import { downloadCSV, stampName } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/listening")({
  component: Listening,
  head: () => ({
    meta: [
      { title: "Listening · Groundwork" },
      {
        name: "description",
        content:
          "News, blogs and social posts swept hourly, read for mood and issue, with keyword alerts to email and WhatsApp.",
      },
      { property: "og:title", content: "Listening · Groundwork" },
      {
        property: "og:description",
        content:
          "News, blogs and social posts swept hourly, read for mood and issue, with keyword alerts to email and WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "never";

const MOOD: Record<string, string> = { positive: "warm", neutral: "neutral", negative: "angry" };
const TABS = [
  { key: "pulse", label: "Pulse" },
  { key: "mentions", label: "Mentions" },
  { key: "watchlist", label: "Watchlist" },
  { key: "alerts", label: "Alerts" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function Listening() {
  const fetchData = useServerFn(getListening);
  const sweep = useServerFn(sweepListening);
  const resume = useServerFn(resumeListening);
  const upsertTopic = useServerFn(saveTopic);
  const flipTopic = useServerFn(toggleTopic);
  const dropTopic = useServerFn(deleteTopic);
  const upsertAlert = useServerFn(saveAlert);
  const flipAlert = useServerFn(toggleAlert);
  const dropAlert = useServerFn(deleteAlert);
  const fireTest = useServerFn(testAlert);
  const markMention = useServerFn(setMentionStatus);

  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["listening"], queryFn: () => fetchData() });

  const [tab, setTab] = useState<Tab>("pulse");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState("all");
  const [mood, setMood] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [search, setSearch] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["listening"] });

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      await refresh();
      setNote(ok);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const t = data?.totals;
  const trend = t ? t.last24h - t.prev24h : 0;
  const moodScore = useMemo(() => {
    const rated = (t?.positive ?? 0) + (t?.neutral ?? 0) + (t?.negative ?? 0);
    return rated ? Math.round((((t?.positive ?? 0) - (t?.negative ?? 0)) / rated) * 100) : 0;
  }, [t]);

  const mentions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.mentions ?? []).filter((m) => {
      if (source !== "all" && m.source !== source) return false;
      if (mood !== "all" && (m.sentiment ?? "unrated") !== mood) return false;
      if (topicFilter !== "all" && m.topicId !== topicFilter) return false;
      if (q && !`${m.title ?? ""} ${m.snippet ?? ""} ${m.domain ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, source, mood, topicFilter, search]);

  const answerToday = (data?.mentions ?? [])
    .filter((m) => m.sentiment === "negative" && m.status === "new")
    .slice(0, 8);

  const maxIssue = Math.max(...(data?.byIssue ?? []).map((i) => i.n), 1);
  const maxSource = Math.max(...(data?.bySource ?? []).map((s) => s.n), 1);
  const maxDay = Math.max(...(data?.byDay ?? []).map((d) => d.positive + d.neutral + d.negative), 1);

  const exportMentions = () =>
    downloadCSV(
      stampName("listening-mentions"),
      ["found", "published", "topic", "source", "domain", "title", "mood", "score", "issue", "status", "url"],
      mentions.map((m) => [
        m.foundAt,
        m.publishedAt ?? "",
        m.topic ?? "",
        m.source,
        m.domain ?? "",
        m.title ?? "",
        m.sentiment ?? "unrated",
        m.sentimentScore ?? "",
        m.issue ?? "",
        m.status,
        m.url,
      ]),
    );

  return (
    <section className="view active" aria-label="Listening">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Comms · listening</span>
          <h1>
            Everything said about you, <span className="serif">in one room.</span>
          </h1>
          <p className="meta">
            News sites, blogs and public posts swept every hour against your watchlist, read for mood and
            issue, and pushed to whoever needs to know.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className={data?.job?.status === "paused" ? "dot-stale" : "dot-live"} aria-hidden="true" />{" "}
            {data?.job?.status === "paused" ? "sweeping paused" : `last sweep ${stamp(data?.job?.lastRunAt ?? null)}`}
          </span>
          <button className="btn btn--primary" disabled={busy} onClick={() => act(() => sweep({ data: {} }), "Sweep finished.")}>
            {busy ? "Sweeping…" : "Sweep now"}
          </button>
        </div>
      </div>

      {data?.job?.status === "paused" && (
        <div className="card note--flag" style={{ marginTop: 12 }}>
          <div className="card-head">
            <h2>Sweeping stopped</h2>
            <button className="btn btn--sm" onClick={() => act(() => resume(), "Sweeping restarted.")}>
              Restart
            </button>
          </div>
          <p className="f-note">{data.job.pausedReason}</p>
        </div>
      )}

      {note && <p className="f-note" style={{ marginTop: 10 }}>{note}</p>}

      <div className="fchips" style={{ marginTop: 14 }}>
        {TABS.map((x) => (
          <button
            key={x.key}
            className={`fchip${tab === x.key ? " active" : ""}`}
            onClick={() => setTab(x.key)}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "pulse" && (
        <>
          <div className="g5" style={{ marginTop: 14 }}>
            <div className="kpi">
              <span className="kpi-lbl">Mentions tracked</span>
              <span className="kpi-val">{nf.format(t?.mentions ?? 0)}</span>
              <span className="kpi-foot">across the whole watchlist</span>
            </div>
            <div className="kpi">
              <span className="kpi-lbl">Last 24 hours</span>
              <span className="kpi-val">{nf.format(t?.last24h ?? 0)}</span>
              <span className="kpi-foot">
                {trend === 0 ? "level with yesterday" : `${trend > 0 ? "+" : ""}${trend} on yesterday`}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-lbl">Mood balance</span>
              <span className="kpi-val">{moodScore > 0 ? `+${moodScore}` : moodScore}</span>
              <span className="kpi-foot">warm minus angry, out of 100</span>
            </div>
            <div className={`kpi${(t?.needsReview ?? 0) > 0 ? " note--flag" : ""}`}>
              <span className="kpi-lbl">Angry, unhandled</span>
              <span className="kpi-val">{nf.format(t?.needsReview ?? 0)}</span>
              <span className="kpi-foot">nobody has looked at these yet</span>
            </div>
            <div className="kpi">
              <span className="kpi-lbl">Waiting on a read</span>
              <span className="kpi-val">{nf.format(t?.unrated ?? 0)}</span>
              <span className="kpi-foot">no mood attached yet</span>
            </div>
          </div>

          <div className="g2 fx2" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card-head">
                <h2>Mood, day by day</h2>
                <span className="mono">last 14 days</span>
              </div>
              <div className="barlist">
                {(data?.byDay ?? []).map((d) => {
                  const total = d.positive + d.neutral + d.negative;
                  return (
                    <div className="barlist-row" key={d.day}>
                      <span className="lbl">{d.day.slice(5)}</span>
                      <span className="barlist-track">
                        <i style={{ width: `${(total / maxDay) * 100}%` }} />
                      </span>
                      <span className="val">
                        {total} · {d.negative} angry
                      </span>
                    </div>
                  );
                })}
                {(data?.byDay ?? []).length === 0 && <p className="f-note">Nothing swept yet.</p>}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Where it is being said</h2>
                <span className="mono">by source</span>
              </div>
              <div className="barlist">
                {(data?.bySource ?? []).map((s) => (
                  <div className="barlist-row" key={s.source}>
                    <span className="lbl">{s.source}</span>
                    <span className="barlist-track">
                      <i style={{ width: `${(s.n / maxSource) * 100}%` }} />
                    </span>
                    <span className="val">
                      {nf.format(s.n)} · {s.negative} angry
                    </span>
                  </div>
                ))}
                {(data?.bySource ?? []).length === 0 && <p className="f-note">Nothing swept yet.</p>}
              </div>
            </div>
          </div>

          <div className="g2 fx3" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <h2>Issues running hot</h2>
                  <p className="meta">Today against yesterday, so a spike shows up early.</p>
                </div>
                <span className="mono">24h</span>
              </div>
              <div className="barlist">
                {(data?.byIssue ?? []).map((i) => (
                  <div className="barlist-row" key={i.issue}>
                    <span className="lbl">{i.issue}</span>
                    <span className="barlist-track">
                      <i style={{ width: `${(i.n / maxIssue) * 100}%` }} />
                    </span>
                    <span className="val">
                      {nf.format(i.n)}
                      {i.prev > 0 && i.n > i.prev * 1.5 ? " · rising" : ""}
                    </span>
                  </div>
                ))}
                {(data?.byIssue ?? []).length === 0 && <p className="f-note">No issues tagged yet.</p>}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Answer today</h2>
                <span className="mono">angry, untouched</span>
              </div>
              <div className="t-list">
                {answerToday.map((m) => (
                  <div className="t-row" key={m.id}>
                    <span className="t-when mono">{stamp(m.foundAt)}</span>
                    <span className="t-what">
                      <a href={m.url} target="_blank" rel="noreferrer">
                        <b>{m.title ?? m.domain ?? m.url}</b>
                      </a>{" "}
                      · {m.snippet?.slice(0, 120) ?? ""}
                    </span>
                    <span className="t-who">
                      {m.issue ?? "unsorted"} ·{" "}
                      <button className="btn btn--sm" onClick={() => act(() => markMention({ data: { id: m.id, status: "actioned" } }), "Marked handled.")}>
                        handled
                      </button>
                    </span>
                  </div>
                ))}
                {answerToday.length === 0 && <p className="f-note">Nothing angry is sitting unhandled.</p>}
              </div>
            </div>
          </div>

          <div className="g2 fx4" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card-head">
                <h2>Loudest outlets</h2>
                <span className="mono">by domain</span>
              </div>
              <div className="f-rows">
                {(data?.byDomain ?? []).map((d) => (
                  <div className="f-row" key={d.domain}>
                    <span>{d.domain}</span>
                    <b>
                      {nf.format(d.n)} · {d.negative} angry
                    </b>
                  </div>
                ))}
                {(data?.byDomain ?? []).length === 0 && <p className="f-note">Nothing swept yet.</p>}
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <div>
                  <h2>Your own inbox, for comparison</h2>
                  <p className="meta">What people write to you directly, not what is published about you.</p>
                </div>
                <span className="mono">issues</span>
              </div>
              <div className="f-rows">
                {(data?.ownedIssues ?? []).map((i) => (
                  <div className="f-row" key={i.issue}>
                    <span>{i.issue}</span>
                    <b>{nf.format(i.n)}</b>
                  </div>
                ))}
                {(data?.ownedIssues ?? []).length === 0 && <p className="f-note">No tagged conversations yet.</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "mentions" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <div>
              <h2>Every mention</h2>
              <p className="meta">{nf.format(mentions.length)} shown of {nf.format(data?.mentions.length ?? 0)}.</p>
            </div>
            <button className="btn btn--sm" onClick={exportMentions}>
              Download CSV
            </button>
          </div>

          <div className="ibx-f" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              className="ibx-search"
              placeholder="Search headlines and text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
              <option value="all">All topics</option>
              {(data?.topics ?? []).map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.label}
                </option>
              ))}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">All sources</option>
              {(data?.bySource ?? []).map((s) => (
                <option key={s.source} value={s.source}>
                  {s.source}
                </option>
              ))}
            </select>
            <select value={mood} onChange={(e) => setMood(e.target.value)}>
              <option value="all">Any mood</option>
              <option value="negative">Angry</option>
              <option value="neutral">Neutral</option>
              <option value="positive">Warm</option>
              <option value="unrated">Not read yet</option>
            </select>
          </div>

          <div className="t-list">
            {mentions.slice(0, 150).map((m) => (
              <div className="t-row" key={m.id}>
                <span className="t-when mono">{stamp(m.foundAt)}</span>
                <span className="t-what">
                  <a href={m.url} target="_blank" rel="noreferrer">
                    <b>{m.title ?? m.url}</b>
                  </a>
                  <br />
                  <span className="meta">{m.snippet?.slice(0, 180) ?? "no extract"}</span>
                </span>
                <span className="t-who">
                  {m.domain ?? m.source} · {m.sentiment ? MOOD[m.sentiment] : "unread"} ·{" "}
                  {m.issue ?? "unsorted"}
                  <br />
                  <button
                    className="btn btn--sm"
                    onClick={() =>
                      act(
                        () => markMention({ data: { id: m.id, status: m.status === "actioned" ? "new" : "actioned" } }),
                        "Updated.",
                      )
                    }
                  >
                    {m.status === "actioned" ? "handled" : "mark handled"}
                  </button>
                </span>
              </div>
            ))}
            {mentions.length === 0 && (
              <p className="f-note">Nothing matches. Run a sweep or widen the filters.</p>
            )}
          </div>
        </div>
      )}

      {tab === "watchlist" && <Watchlist data={data} busy={busy} act={act} save={upsertTopic} flip={flipTopic} drop={dropTopic} />}

      {tab === "alerts" && (
        <Alerts
          data={data}
          busy={busy}
          act={act}
          save={upsertAlert}
          flip={flipAlert}
          drop={dropAlert}
          test={fireTest}
        />
      )}
    </section>
  );
}

/* --------------------------------------------------------------- watchlist */

type Data = Awaited<ReturnType<typeof getListening>> | undefined;
type Act = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

function Watchlist({
  data,
  busy,
  act,
  save,
  flip,
  drop,
}: {
  data: Data;
  busy: boolean;
  act: Act;
  save: (a: { data: any }) => Promise<unknown>;
  flip: (a: { data: any }) => Promise<unknown>;
  drop: (a: { data: any }) => Promise<unknown>;
}) {
  const [form, setForm] = useState({ label: "", query: "", keywords: "", excludeTerms: "", kind: "issue" });

  return (
    <div className="g2" style={{ marginTop: 14 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>What we watch</h2>
            <p className="meta">Each topic is searched across news, blogs and public posts every hour.</p>
          </div>
          <span className="mono">{data?.topics.length ?? 0} topics</span>
        </div>
        <div className="f-rows">
          {(data?.topics ?? []).map((tp) => (
            <div className="f-row" key={tp.id}>
              <span>
                <b>{tp.label}</b>
                <br />
                <span className="meta">
                  {tp.query} · {tp.kind} · swept {stamp(tp.lastScannedAt)}
                </span>
              </span>
              <b style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {tp.mentions} found · {tp.negative} angry
                <button
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() => act(() => flip({ data: { id: tp.id, active: !tp.active } }), "Updated.")}
                >
                  {tp.active ? "on" : "off"}
                </button>
                <button
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() => act(() => drop({ data: { id: tp.id } }), "Topic removed.")}
                >
                  remove
                </button>
              </b>
            </div>
          ))}
          {(data?.topics ?? []).length === 0 && <p className="f-note">No topics yet.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Add a topic</h2>
          <span className="mono">watchlist</span>
        </div>
        <div className="auth-form">
          <label className="auth-field">
            <span>Name</span>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Water in Embakasi" />
          </label>
          <label className="auth-field">
            <span>Search phrase</span>
            <input value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} placeholder="Embakasi water shortage Nairobi" />
          </label>
          <label className="auth-field">
            <span>Extra keywords, comma separated</span>
            <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="borehole, tanker, rationing" />
          </label>
          <label className="auth-field">
            <span>Words to exclude</span>
            <input value={form.excludeTerms} onChange={(e) => setForm({ ...form, excludeTerms: e.target.value })} placeholder="football, betting" />
          </label>
          <label className="auth-field">
            <span>Type</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="campaign">Us</option>
              <option value="rival">A rival</option>
              <option value="issue">An issue</option>
            </select>
          </label>
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await save({ data: form });
                setForm({ label: "", query: "", keywords: "", excludeTerms: "", kind: "issue" });
              }, "Topic added.")
            }
          >
            Add to watchlist
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ alerts */

function Alerts({
  data,
  busy,
  act,
  save,
  flip,
  drop,
  test,
}: {
  data: Data;
  busy: boolean;
  act: Act;
  save: (a: { data: any }) => Promise<unknown>;
  flip: (a: { data: any }) => Promise<unknown>;
  drop: (a: { data: any }) => Promise<unknown>;
  test: (a: { data: any }) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    name: "",
    topicId: "",
    keywords: "",
    sentiments: ["negative"] as string[],
    channel: "email",
    destination: "",
    minMatches: 1,
    frequency: "instant",
  });

  const toggleMood = (m: string) =>
    setForm((f) => ({
      ...f,
      sentiments: f.sentiments.includes(m) ? f.sentiments.filter((x) => x !== m) : [...f.sentiments, m],
    }));

  return (
    <>
      <div className="g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Who gets told what</h2>
              <p className="meta">Alerts fire as soon as a matching mention is read, or once a day.</p>
            </div>
            <span className="mono">{data?.alerts.length ?? 0} rules</span>
          </div>
          <div className="f-rows">
            {(data?.alerts ?? []).map((a) => (
              <div className="f-row" key={a.id}>
                <span>
                  <b>{a.name}</b>
                  <br />
                  <span className="meta">
                    {a.channel === "email" ? "Email" : "WhatsApp"} to {a.destination} ·{" "}
                    {a.keywords.length ? a.keywords.join(", ") : "any keyword"} ·{" "}
                    {a.sentiments.map((s) => MOOD[s] ?? s).join("/")} · {a.frequency} · last fired{" "}
                    {stamp(a.lastFiredAt)}
                  </span>
                </span>
                <b style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn--sm" disabled={busy} onClick={() => act(() => test({ data: { id: a.id } }), "Test alert queued.")}>
                    test
                  </button>
                  <button
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={() => act(() => flip({ data: { id: a.id, active: !a.active } }), "Updated.")}
                  >
                    {a.active ? "on" : "off"}
                  </button>
                  <button className="btn btn--sm" disabled={busy} onClick={() => act(() => drop({ data: { id: a.id } }), "Alert removed.")}>
                    remove
                  </button>
                </b>
              </div>
            ))}
            {(data?.alerts ?? []).length === 0 && <p className="f-note">No alert rules yet.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>New alert</h2>
            <span className="mono">email or WhatsApp</span>
          </div>
          <div className="auth-form">
            <label className="auth-field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anything angry about water" />
            </label>
            <label className="auth-field">
              <span>Topic</span>
              <select value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
                <option value="">Any topic</option>
                {(data?.topics ?? []).map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="auth-field">
              <span>Keywords, comma separated</span>
              <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="water, rationing" />
            </label>
            <div className="fchips">
              {["negative", "neutral", "positive"].map((m) => (
                <button
                  key={m}
                  className={`fchip${form.sentiments.includes(m) ? " active" : ""}`}
                  onClick={() => toggleMood(m)}
                >
                  {MOOD[m]}
                </button>
              ))}
            </div>
            <label className="auth-field">
              <span>Send by</span>
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
            <label className="auth-field">
              <span>{form.channel === "email" ? "Email address" : "WhatsApp number"}</span>
              <input
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder={form.channel === "email" ? "comms@campaign.co.ke" : "+254712345678"}
              />
            </label>
            <label className="auth-field">
              <span>How often</span>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="instant">The moment it appears</option>
                <option value="daily">Once a day, bundled</option>
              </select>
            </label>
            <label className="auth-field">
              <span>Only fire after this many hits</span>
              <input
                type="number"
                min={1}
                max={20}
                value={form.minMatches}
                onChange={(e) => setForm({ ...form, minMatches: Number(e.target.value) })}
              />
            </label>
            <button
              className="btn btn--primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await save({ data: form });
                  setForm({ ...form, name: "", keywords: "", destination: "" });
                }, "Alert saved.")
              }
            >
              Save alert
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Alert log</h2>
            <p className="meta">Every alert raised, where it was headed and whether it has gone out.</p>
          </div>
          <span className="mono">{data?.events.length ?? 0} recent</span>
        </div>
        <div className="t-list">
          {(data?.events ?? []).map((e) => (
            <div className="t-row" key={e.id}>
              <span className="t-when mono">{stamp(e.at)}</span>
              <span className="t-what">
                <b>{e.subject ?? e.alert ?? "alert"}</b> · {e.channel} to {e.destination}
              </span>
              <span className="t-who">
                {e.status}
                {e.detail ? ` · ${e.detail}` : ""}
              </span>
            </div>
          ))}
          {(data?.events ?? []).length === 0 && <p className="f-note">No alerts raised yet.</p>}
        </div>
      </div>
    </>
  );
}
