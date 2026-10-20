// Listening's settings tabs: the keywords swept every hour, and the alerts that tell someone when
// a keyword turns up. Moved out of the page so the route keeps to the overview and the posts.
import { useState } from "react";

import { stamp } from "@/lib/format";
import type { getListening } from "@/lib/listening.functions";

const MOOD: Record<string, string> = { positive: "warm", neutral: "neutral", negative: "angry" };

/* ---------------------------------------------------------------- keywords */

export type Data = Awaited<ReturnType<typeof getListening>> | undefined;
export type Act = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

export function Keywords({
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
                  type="button"
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() =>
                    act(() => flip({ data: { id: tp.id, active: !tp.active } }), "Updated.")
                  }
                >
                  {tp.active ? "on" : "off"}
                </button>
                <button
                  type="button"
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
            type="button"
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

export function Alerts({
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
                    type="button"
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={() => act(() => test({ data: { id: a.id } }), "Test alert queued.")}
                  >
                    test
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={() =>
                      act(() => flip({ data: { id: a.id, active: !a.active } }), "Updated.")
                    }
                  >
                    {a.active ? "on" : "off"}
                  </button>
                  <button
                    type="button"
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
                  type="button"
                  key={m}
                  className={`fchip${form.sentiments.includes(m) ? " active" : ""}`}
                  aria-pressed={form.sentiments.includes(m)}
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
              type="button"
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
