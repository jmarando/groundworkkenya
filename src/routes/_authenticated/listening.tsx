import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { filterMentions } from "@/lib/listening-filter";
import { Overview, PostList } from "@/components/gw/listening/Overview";
import { sourceName } from "@/lib/listening-read";
import { nf, stamp } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/listening")({
  // ?issue=water: a link from Home opens the mentions about that issue.
  validateSearch: (search: Record<string, unknown>): { issue?: string } => {
    const v =
      typeof search["issue"] === "string" ? search["issue"].trim().toLowerCase().slice(0, 40) : "";
    return v ? { issue: v } : {};
  },
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

const MOOD: Record<string, string> = { positive: "warm", neutral: "neutral", negative: "angry" };
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "mentions", label: "All posts" },
  { key: "keywords", label: "Keywords" },
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

  const { issue } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [tab, setTab] = useState<Tab>(issue ? "mentions" : "overview");
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

  const mentions = useMemo(
    () =>
      filterMentions(data?.mentions ?? [], {
        source,
        mood,
        topic: topicFilter,
        search,
        issue: issue ?? null,
      }),
    [data, source, mood, topicFilter, search, issue],
  );

  const mark = (ids: string[], status: "new" | "actioned") =>
    act(
      () => markMention({ data: { ids, status } }),
      status === "actioned" ? `Marked ${ids.length} handled.` : "Reopened.",
    );

  const exportMentions = () =>
    downloadCSV(
      stampName("listening-mentions"),
      [
        "found",
        "published",
        "topic",
        "source",
        "domain",
        "title",
        "mood",
        "score",
        "issue",
        "status",
        "url",
      ],
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
            News, Facebook, X, Instagram, TikTok, YouTube and blogs swept every hour against your
            keywords. Start with what to do; open anything to read the posts behind it.
          </p>
        </div>
        <div className="vh-side">
          <Link to="/social" className="btn btn--ghost btn--sm">
            Social & sentiment
          </Link>
          <span className="syncline">
            <span
              className={data?.job?.status === "paused" ? "dot-stale" : "dot-live"}
              aria-hidden="true"
            />{" "}
            {data?.job?.status === "paused"
              ? "sweeping paused"
              : `last sweep ${stamp(data?.job?.lastRunAt ?? null)}`}
          </span>
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() => act(() => sweep({ data: {} }), "Sweep finished.")}
          >
            {busy ? "Sweeping…" : "Sweep now"}
          </button>
        </div>
      </div>

      {data?.job?.status === "paused" && (
        <div className="card note--flag" style={{ marginTop: 12 }}>
          <div className="card-head">
            <h2>Sweeping stopped</h2>
            <button
              className="btn btn--sm"
              onClick={() => act(() => resume(), "Sweeping restarted.")}
            >
              Restart
            </button>
          </div>
          <p className="f-note">{data.job.pausedReason}</p>
        </div>
      )}

      {note && (
        <p className="f-note" style={{ marginTop: 10 }}>
          {note}
        </p>
      )}

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

      {tab === "overview" && (
        <>
          <p className="meta lsn-status">
            Following {(data?.topics ?? []).filter((tp) => tp.active).length} keywords
            {" · "}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setTab("keywords")}
            >
              change
            </button>
            {" · "}
            Candidates&apos; own accounts:{" "}
            {data?.rivalJob?.lastRunAt
              ? `last read ${stamp(data.rivalJob.lastRunAt)}${data.rivalJob.detail ? ` (${data.rivalJob.detail})` : ""}`
              : "not read yet"}
          </p>
          <Overview
            topics={data?.topics ?? []}
            mentions={data?.mentions ?? []}
            busy={busy}
            mark={mark}
            openKeywords={() => setTab("keywords")}
          />
        </>
      )}

      {tab === "mentions" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <div>
              <h2>Every post found</h2>
              <p className="meta">
                {nf.format(mentions.length)} shown of {nf.format(data?.mentions.length ?? 0)}.
              </p>
            </div>
            <button className="btn btn--sm" onClick={exportMentions}>
              Download CSV
            </button>
          </div>

          <div className="ibx-f" style={{ gap: 8, flexWrap: "wrap" }}>
            {issue ? (
              <button
                type="button"
                className="fchip active"
                aria-label={`Showing ${issue} only. Show every issue`}
                onClick={() => void navigate({ search: {} })}
              >
                Issue: {issue} ×
              </button>
            ) : null}
            <input
              className="ibx-search"
              placeholder="Search headlines and text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
              <option value="all">All keywords</option>
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
                  {sourceName(s.source)}
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

          <PostList posts={mentions} busy={busy} mark={mark} />
        </div>
      )}

      {tab === "keywords" && (
        <Keywords
          data={data}
          busy={busy}
          act={act}
          save={upsertTopic}
          flip={flipTopic}
          drop={dropTopic}
        />
      )}

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

/* ---------------------------------------------------------------- keywords */

type Data = Awaited<ReturnType<typeof getListening>> | undefined;
type Act = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

function Keywords({
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
  const empty = {
    label: "",
    query: "",
    keywords: "",
    excludeTerms: "",
    alertFeedUrl: "",
    kind: "issue",
  };
  const [form, setForm] = useState(empty);

  return (
    <div className="g2" style={{ marginTop: 14 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Keywords</h2>
            <p className="meta">
              Each keyword is searched across news, blogs and public posts every hour, and its
              Google Alert feed read when it has one.
            </p>
          </div>
          <span className="mono">{data?.topics.length ?? 0} keywords</span>
        </div>
        <div className="f-rows">
          {(data?.topics ?? []).map((tp) => (
            <div className="f-row" key={tp.id}>
              <span>
                <b>{tp.label}</b>
                <br />
                <span className="meta">
                  {tp.query} · {tp.kind} · swept {stamp(tp.lastScannedAt)}
                  {tp.alertFeedUrl ? " · Google Alert" : ""}
                </span>
                <br />
                <b>
                  {tp.mentions} found · {tp.negative} angry
                </b>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <button
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() =>
                    act(() => flip({ data: { id: tp.id, active: !tp.active } }), "Updated.")
                  }
                >
                  {tp.active ? "on" : "off"}
                </button>
                <button
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() => act(() => drop({ data: { id: tp.id } }), "Keyword removed.")}
                >
                  remove
                </button>
              </span>
            </div>
          ))}
          {(data?.topics ?? []).length === 0 && <p className="f-note">No keywords yet.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Add a keyword</h2>
          <span className="mono">keywords</span>
        </div>
        <div className="auth-form">
          <label className="auth-field">
            <span>Name</span>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Water in Embakasi"
            />
          </label>
          <label className="auth-field">
            <span>Search phrase</span>
            <input
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
              placeholder="Embakasi water shortage Nairobi"
            />
          </label>
          <label className="auth-field">
            <span>Extra keywords, comma separated</span>
            <input
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              placeholder="borehole, tanker, rationing"
            />
          </label>
          <label className="auth-field">
            <span>Words to exclude</span>
            <input
              value={form.excludeTerms}
              onChange={(e) => setForm({ ...form, excludeTerms: e.target.value })}
              placeholder="football, betting"
            />
          </label>
          <label className="auth-field">
            <span>Google Alert feed (optional)</span>
            <input
              value={form.alertFeedUrl}
              onChange={(e) => setForm({ ...form, alertFeedUrl: e.target.value })}
              placeholder="https://www.google.com/alerts/feeds/…"
            />
          </label>
          <p className="f-note">
            On google.com/alerts, create the alert, open Show options and set Deliver to: RSS feed.
            Copy the feed icon&apos;s link and paste it here. It costs no credits.
          </p>
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
                setForm(empty);
              }, "Keyword added.")
            }
          >
            Add keyword
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
      sentiments: f.sentiments.includes(m)
        ? f.sentiments.filter((x) => x !== m)
        : [...f.sentiments, m],
    }));

  return (
    <>
      <div className="g2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Who gets told what</h2>
              <p className="meta">
                Alerts fire as soon as a matching mention is read, or once a day.
              </p>
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
                  <button
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={() => act(() => test({ data: { id: a.id } }), "Test alert queued.")}
                  >
                    test
                  </button>
                  <button
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={() =>
                      act(() => flip({ data: { id: a.id, active: !a.active } }), "Updated.")
                    }
                  >
                    {a.active ? "on" : "off"}
                  </button>
                  <button
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={() => act(() => drop({ data: { id: a.id } }), "Alert removed.")}
                  >
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
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Anything angry about water"
              />
            </label>
            <label className="auth-field">
              <span>Topic</span>
              <select
                value={form.topicId}
                onChange={(e) => setForm({ ...form, topicId: e.target.value })}
              >
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
              <input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                placeholder="water, rationing"
              />
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
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
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
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              >
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
            <p className="meta">
              Every alert raised, where it was headed and whether it has gone out.
            </p>
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
