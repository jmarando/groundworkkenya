import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPolling } from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/polling")({
  component: Polling,
  head: () => ({
    meta: [
      { title: "Polling · Groundwork" },
      {
        name: "description",
        content: "Run short polls by SMS and USSD and read the results ward by ward.",
      },
      { property: "og:title", content: "Polling · Groundwork" },
      {
        property: "og:description",
        content: "Run short polls by SMS and USSD and read the results ward by ward.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";

function Polling() {
  const fetchPolling = useServerFn(getPolling);
  const { data } = useQuery({ queryKey: ["polling"], queryFn: () => fetchPolling() });

  if (!data) {
    return (
      <section className="view active" aria-label="Polling">
        <div className="vh">
          <div>
            <span className="eyebrow">Listening · polling</span>
            <h1>
              Ask, <span className="serif">then count.</span>
            </h1>
            <p className="meta">Loading polls…</p>
          </div>
        </div>
      </section>
    );
  }

  const totalResponses = data.polls.reduce((s, p) => s + p.responses, 0);

  return (
    <section className="view active" aria-label="Polling">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Listening · polling</span>
          <h1>
            Ask, <span className="serif">then count.</span>
          </h1>
          <p className="meta">
            Short polls on SMS and USSD, answered on any handset. Results land here as they come in.
          </p>
        </div>
        <div className="vh-side">
          <button className="btn btn--primary" type="button">
            New poll
          </button>
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(totalResponses)} responses
            counted
          </span>
        </div>
      </div>

      <div className="g2 fx2">
        {data.polls.map((p) => {
          const max = Math.max(...p.options.map((o) => o.count), 1);
          const pct = p.sampleTarget
            ? Math.min((p.responses / p.sampleTarget) * 100, 100)
            : 0;
          return (
            <div className="card" key={p.id}>
              <div className="card-head">
                <div>
                  <h2>{p.question}</h2>
                  <p className="meta">
                    <span className="mono">{p.code}</span> · {p.channels.join(" · ")} ·{" "}
                    {day(p.opensAt)} to {day(p.closesAt)}
                  </p>
                </div>
                <span className={`pill ${p.status === "live" ? "pill--ok" : "pill--amber"}`}>
                  <span className="g" aria-hidden="true">
                    ●
                  </span>{" "}
                  {p.status}
                </span>
              </div>

              <div className="barlist">
                {p.options.map((o) => (
                  <div className="barlist-row" key={o.key}>
                    <span className="lbl">{o.label}</span>
                    <span className="barlist-track">
                      <i style={{ width: `${(o.count / max) * 100}%` }} />
                    </span>
                    <span className="val">
                      {nf.format(o.count)}
                      {p.responses ? ` · ${((o.count / p.responses) * 100).toFixed(0)}%` : ""}
                    </span>
                  </div>
                ))}
                {p.options.length === 0 && <p className="f-note">Free-text poll — no options.</p>}
              </div>

              <div className="f-rows" style={{ marginTop: 12 }}>
                <div className="f-row">
                  <span>Responses</span>
                  <b className="stat">{nf.format(p.responses)}</b>
                </div>
                <div className="f-row">
                  <span>Sample target</span>
                  <b className="stat">{nf.format(p.sampleTarget)}</b>
                </div>
                <div className="f-row">
                  <span>Channel mix</span>
                  <b>
                    {p.channelMix.map((c) => `${c.channel.toUpperCase()} ${c.count}`).join(" · ") ||
                      "—"}
                  </b>
                </div>
                {p.reward && (
                  <div className="f-row">
                    <span>Reward</span>
                    <b>{p.reward}</b>
                  </div>
                )}
              </div>
              {p.sampleTarget > 0 && (
                <>
                  <div className="minibar" style={{ marginTop: 10 }}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <p className="f-note">{pct.toFixed(0)}% of the sample target reached.</p>
                </>
              )}
            </div>
          );
        })}
        {data.polls.length === 0 && (
          <div className="card">
            <p className="f-note">No polls yet. Create one to start collecting answers.</p>
          </div>
        )}
      </div>

      {data.heat && (
        <div className="card fx3" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2>Where the answers differ</h2>
            <span className="mono">share of responses by constituency</span>
          </div>
          <div className="tblwrap">
            <table className="tbl heat">
              <thead>
                <tr>
                  <th>Option</th>
                  {data.heat.constituencies.map((c) => (
                    <th key={c} style={{ textAlign: "right" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.heat.rows.map((r) => (
                  <tr key={r.option}>
                    <td>
                      <b>{r.option}</b>
                    </td>
                    {r.shares.map((s, i) => (
                      <td
                        className="num"
                        key={i}
                        style={{
                          background: `color-mix(in srgb, var(--murram) ${Math.round(s)}%, transparent)`,
                        }}
                      >
                        {s.toFixed(0)}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="f-note">
            Every response is tied to a ward, so you can see which side of the constituency answered
            differently.
          </p>
        </div>
      )}
    </section>
  );
}
