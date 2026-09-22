import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { analyseSentiment, getSocial, saveSocialAccount } from "@/lib/social.functions";
import { downloadCSV, stampName } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/social")({
  component: Social,
  head: () => ({
    meta: [
      { title: "Social & sentiment · Groundwork" },
      {
        name: "description",
        content:
          "Facebook, Instagram, X and WhatsApp in one queue, with the mood and the issue read off every message.",
      },
      { property: "og:title", content: "Social & sentiment · Groundwork" },
      {
        property: "og:description",
        content:
          "Facebook, Instagram, X and WhatsApp in one queue, with the mood and the issue read off every message.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");

const LABEL: Record<string, { name: string; code: string; cls: string; note: string }> = {
  facebook: {
    name: "Facebook Page",
    code: "FB",
    cls: "ch--fb",
    note: "Page comments, mentions and Messenger DMs through the Meta app. Needs business verification.",
  },
  instagram: {
    name: "Instagram",
    code: "IG",
    cls: "ch--ig",
    note: "Professional account linked to the page. Comments and DMs on the same webhook.",
  },
  x: {
    name: "X",
    code: "X",
    cls: "ch--x",
    note: "Mentions and DMs through Account Activity. Needs a paid API tier.",
  },
  whatsapp: {
    name: "WhatsApp Business",
    code: "WA",
    cls: "ch--wa",
    note: "Cloud API number. Meta restricts political use — check eligibility before going live.",
  },
};

const MOOD: Record<string, string> = { positive: "warm", neutral: "neutral", negative: "angry" };

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Social() {
  const fetchSocial = useServerFn(getSocial);
  const runAnalysis = useServerFn(analyseSentiment);
  const saveAccount = useServerFn(saveSocialAccount);
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ["social"], queryFn: () => fetchSocial() });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [platform, setPlatform] = useState("all");

  const t = data?.totals;
  const recent = (data?.recent ?? []).filter((r) => platform === "all" || r.platform === platform);
  const maxIssue = Math.max(...(data?.byIssue ?? []).map((i) => i.n), 1);

  async function analyse() {
    setBusy(true);
    setNote(null);
    try {
      const res = await runAnalysis({ data: { limit: 40 } });
      setNote(
        res.error
          ? res.error
          : res.analysed === 0
            ? "Nothing new to read — every message already has a mood."
            : `Read ${res.analysed} message${res.analysed === 1 ? "" : "s"}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["social"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (err) {
      setNote(err instanceof Error ? err.message : "The analysis could not run.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLive(id: string, live: boolean) {
    setNote(null);
    try {
      await saveAccount({ data: { id, live } });
      await queryClient.invalidateQueries({ queryKey: ["social"] });
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That change could not be saved.");
    }
  }

  return (
    <section className="view active" aria-label="Social and sentiment">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Comms · social</span>
          <h1>
            The mood, <span className="serif">read back to you.</span>
          </h1>
          <p className="meta">
            Facebook, Instagram, X and WhatsApp land in the same queue as SMS, sorted by what people
            are actually angry about.
          </p>
        </div>
        <div className="vh-side">
          <button className="btn btn--sm" onClick={() => void analyse()} disabled={busy}>
            {busy ? "Reading…" : "Read the mood"}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() =>
              downloadCSV(
                stampName("groundwork-social"),
                ["Platform", "Kind", "From", "Message", "Mood", "Issue", "Received"],
                recent.map((r) => [
                  r.platform,
                  r.kind,
                  r.author ?? "",
                  r.body,
                  r.sentiment ?? "",
                  r.issue ?? "",
                  r.at.slice(0, 16).replace("T", " "),
                ]),
              )
            }
          >
            Download
          </button>
        </div>
      </div>
      {note && <p className="f-note">{note}</p>}

      <div className="g5 fx2">
        <div className="card kpi">
          <span className="kpi-lbl">Incoming</span>
          <span className="kpi-val stat">{nf.format(t?.inbound ?? 0)}</span>
          <span className="kpi-sub">DMs, comments and mentions on record</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Warm</span>
          <span className="kpi-val stat">{nf.format(t?.positive ?? 0)}</span>
          <span className="kpi-sub">people saying something good</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Angry</span>
          <span className="kpi-val stat">{nf.format(t?.negative ?? 0)}</span>
          <span className="kpi-sub">complaints that need an answer</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Waiting on a reply</span>
          <span className="kpi-val stat">{nf.format(t?.awaitingReply ?? 0)}</span>
          <span className="kpi-sub">open threads with nothing sent back</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Not yet read</span>
          <span className="kpi-val stat">{nf.format(t?.unanalysed ?? 0)}</span>
          <span className="kpi-sub">no mood or issue on them yet</span>
        </div>
      </div>

      <div className="pgrid fx2">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>By platform</h2>
            <span className="mono">warm minus angry</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th className="num">In</th>
                  <th className="num">Warm</th>
                  <th className="num">Angry</th>
                  <th className="num">Mood</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byPlatform ?? []).map((p) => (
                  <tr key={p.platform}>
                    <td>
                      <span className={`ch ${LABEL[p.platform]?.cls ?? "ch--us"}`}>
                        {LABEL[p.platform]?.code ?? p.platform}
                      </span>{" "}
                      {LABEL[p.platform]?.name ?? p.platform}
                    </td>
                    <td className="num">{nf.format(p.inbound)}</td>
                    <td className="num">{nf.format(p.positive)}</td>
                    <td className="num">{nf.format(p.negative)}</td>
                    <td className="num mono">
                      {p.score > 0 ? "+" : ""}
                      {p.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>What they are raising</h2>
            <span className="mono">read off the messages</span>
          </div>
          <div className="f-rows">
            {(data?.byIssue ?? []).map((i) => (
              <div className="f-row" key={i.issue}>
                <span>{i.issue}</span>
                <div className="minibar" style={{ flex: 1, margin: "0 12px" }}>
                  <i style={{ width: `${(i.n / maxIssue) * 100}%` }} />
                </div>
                <span className="num mono">
                  {i.n}
                  {i.negative > 0 ? ` · ${i.negative} angry` : ""}
                </span>
              </div>
            ))}
            {(data?.byIssue ?? []).length === 0 && (
              <p className="f-note">Read the mood to sort these messages by issue.</p>
            )}
          </div>
        </div>
      </div>

      {(data?.hot ?? []).length > 0 && (
        <div className="card" style={{ marginTop: 18, minWidth: 0 }}>
          <div className="card-head">
            <h2>Answer today</h2>
            <span className="mono">angry and nobody has replied</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>From</th>
                  <th>What they said</th>
                  <th>Issue</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.hot ?? []).map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className={`ch ${LABEL[h.platform]?.cls ?? "ch--us"}`}>
                        {LABEL[h.platform]?.code ?? h.platform}
                      </span>
                    </td>
                    <td>{h.author ?? "unknown"}</td>
                    <td>{h.body}</td>
                    <td>{h.issue ?? "—"}</td>
                    <td className="mono">{stamp(h.at)}</td>
                    <td>
                      <Link to="/inbox" className="btn btn--ghost btn--sm">
                        Reply
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 18, minWidth: 0 }}>
        <div className="card-head">
          <h2>Latest in</h2>
          <span className="mono">
            {platform === "all" ? "every platform" : (LABEL[platform]?.name ?? platform)}
          </span>
        </div>
        <div className="ibx-rail" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={`ibx-f${platform === "all" ? " on" : ""}`}
            onClick={() => setPlatform("all")}
          >
            All <b>{data?.recent.length ?? 0}</b>
          </button>
          {(data?.byPlatform ?? []).map((p) => (
            <button
              key={p.platform}
              type="button"
              className={`ibx-f${platform === p.platform ? " on" : ""}`}
              onClick={() => setPlatform(p.platform)}
            >
              {LABEL[p.platform]?.name ?? p.platform} <b>{p.inbound}</b>
            </button>
          ))}
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Kind</th>
                <th>From</th>
                <th>Message</th>
                <th>Mood</th>
                <th>Issue</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`ch ${LABEL[r.platform]?.cls ?? "ch--us"}`}>
                      {LABEL[r.platform]?.code ?? r.platform}
                    </span>
                  </td>
                  <td>{r.kind}</td>
                  <td>{r.author ?? "unknown"}</td>
                  <td>{r.body}</td>
                  <td>{r.sentiment ? (MOOD[r.sentiment] ?? r.sentiment) : "not read"}</td>
                  <td>{r.issue ?? "—"}</td>
                  <td className="mono">{stamp(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && <p className="f-note">Nothing on this platform yet.</p>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, minWidth: 0 }}>
        <div className="card-head">
          <h2>Connected accounts</h2>
          <span className="mono">switch one live once the platform approves it</span>
        </div>
        <div className="f-rows">
          {(data?.accounts ?? []).map((a) => (
            <div className="f-row" key={a.id}>
              <span>
                <span className={`ch ${LABEL[a.platform]?.cls ?? "ch--us"}`}>
                  {LABEL[a.platform]?.code ?? a.platform}
                </span>{" "}
                <b>{a.displayName ?? LABEL[a.platform]?.name ?? a.platform}</b>{" "}
                <span className="mono">{a.handle}</span>
              </span>
              <span className="num mono">
                {a.live ? "live" : "not live"}
                {a.lastEventAt ? ` · last in ${stamp(a.lastEventAt)}` : ""}
              </span>
              <button
                className="btn btn--ghost btn--sm"
                style={{ marginLeft: 12 }}
                onClick={() => void toggleLive(a.id, !a.live)}
              >
                {a.live ? "Switch off" : "Switch live"}
              </button>
            </div>
          ))}
        </div>
        <p className="f-note" style={{ marginTop: 14 }}>
          Messages arrive at <span className="mono">/api/public/social/meta</span> for Facebook,
          Instagram and WhatsApp, and <span className="mono">/api/public/social/x</span> for X. Add
          those two addresses in each platform's developer settings. Replies you write are saved and
          held until the matching account is switched live.
        </p>
      </div>
    </section>
  );
}
