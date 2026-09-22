import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { getInbox } from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/listening")({
  component: Listening,
  head: () => ({
    meta: [
      { title: "Listening · Groundwork" },
      {
        name: "description",
        content: "What people are raising, by issue and ward, drawn from every inbound message.",
      },
      { property: "og:title", content: "Listening · Groundwork" },
      {
        property: "og:description",
        content: "What people are raising, by issue and ward, drawn from every inbound message.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Listening() {
  const fetchInbox = useServerFn(getInbox);
  const { data } = useQuery({ queryKey: ["inbox"], queryFn: () => fetchInbox() });

  const byWard = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.conversations ?? []) {
      const w = c.ward ?? "Ward unknown";
      m.set(w, (m.get(w) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [data]);

  const recent = (data?.conversations ?? []).slice(0, 12);
  const tags = data?.counts.byTag ?? [];
  const maxTag = Math.max(...tags.map((t) => t.n), 1);
  const maxWard = Math.max(...byWard.map((w) => w.n), 1);

  return (
    <section className="view active" aria-label="Listening">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Listening · what people are saying</span>
          <h1>
            The issues, <span className="serif">in their words.</span>
          </h1>
          <p className="meta">
            Every inbound message is tagged by issue and ward, so the pattern shows up before the
            complaint does.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(data?.counts.all ?? 0)}{" "}
            conversations analysed
          </span>
        </div>
      </div>

      <div className="g2 fx2">
        <div className="card">
          <div className="card-head">
            <h2>Issues raised</h2>
            <span className="mono">tag volume</span>
          </div>
          <div className="barlist">
            {tags.map((t) => (
              <div className="barlist-row" key={t.tag}>
                <span className="lbl">{t.tag}</span>
                <span className="barlist-track">
                  <i style={{ width: `${(t.n / maxTag) * 100}%` }} />
                </span>
                <span className="val">{nf.format(t.n)}</span>
              </div>
            ))}
            {tags.length === 0 && <p className="f-note">No tagged conversations yet.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Where it is coming from</h2>
            <span className="mono">conversations by ward</span>
          </div>
          <div className="barlist">
            {byWard.map((w) => (
              <div className="barlist-row" key={w.name}>
                <span className="lbl">{w.name}</span>
                <span className="barlist-track">
                  <i style={{ width: `${(w.n / maxWard) * 100}%` }} />
                </span>
                <span className="val">{nf.format(w.n)}</span>
              </div>
            ))}
            {byWard.length === 0 && <p className="f-note">Nothing to plot yet.</p>}
          </div>
        </div>
      </div>

      <div className="card fx3" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Straight from the inbox</h2>
            <p className="meta">Unedited, with the ward and issue attached.</p>
          </div>
          <span className="mono">{recent.length} most recent</span>
        </div>
        <div className="t-list">
          {recent.map((c) => (
            <div className="t-row" key={c.id}>
              <span className="t-when mono">{stamp(c.lastMessageAt)}</span>
              <span className="t-what">
                <b>{c.name}</b> · {c.snippet ?? c.subject ?? "no text"}
              </span>
              <span className="t-who">
                {c.ward ?? "ward unknown"} · {c.tags.join(" · ") || "untagged"}
              </span>
            </div>
          ))}
          {recent.length === 0 && <p className="f-note">Loading conversations…</p>}
        </div>
      </div>

      <div className="card fx4" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>What listening does not do</h2>
          <span className="mono">stated plainly</span>
        </div>
        <div className="f-rows">
          <div className="f-row">
            <span>No scraping of private accounts</span>
            <b>Only messages people send you, plus public posts</b>
          </div>
          <div className="f-row">
            <span>No profiling by ethnicity or religion</span>
            <b>Issue, ward and consent only</b>
          </div>
          <div className="f-row">
            <span>Every tag is auditable</span>
            <b>You can see who or what applied it, and change it</b>
          </div>
        </div>
      </div>
    </section>
  );
}
