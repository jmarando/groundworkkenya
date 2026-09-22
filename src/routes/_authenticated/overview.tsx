import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getOverview } from "@/lib/overview.functions";

export const Route = createFileRoute("/_authenticated/overview")({
  component: Overview,
  head: () => ({
    meta: [
      { title: "Overview · Groundwork" },
      {
        name: "description",
        content: "The morning brief: supporters, ward pace, contacts and spend at a glance.",
      },
      { property: "og:title", content: "Overview · Groundwork" },
      {
        property: "og:description",
        content: "The morning brief: supporters, ward pace, contacts and spend at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");

function Overview() {
  const fetchOverview = useServerFn(getOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: () => fetchOverview(),
  });

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (isLoading || !data) {
    return (
      <section className="view active" aria-label="Overview">
        <div className="vh">
          <div>
            <span className="eyebrow">Command centre</span>
            <h1>
              The morning, <span className="serif">briefed.</span>
            </h1>
            <p className="meta">Loading the workspace…</p>
          </div>
        </div>
      </section>
    );
  }

  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const supporterPct = pct(data.supporters, data.supporterTarget);
  const spendPct = pct(data.spendKes, data.statutoryLimit);
  const delta =
    data.contactsLastWeek > 0
      ? Math.round(((data.contactsThisWeek - data.contactsLastWeek) / data.contactsLastWeek) * 100)
      : 0;

  const max = Math.max(data.supporterTarget, ...data.growth.map((g) => g.value), 1);
  const pts = data.growth.map((g, i) => {
    const x = 20 + (i * 520) / Math.max(data.growth.length - 1, 1);
    const y = 122 - (g.value / max) * 100;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1]?.split(",") ?? ["540", "45"];

  return (
    <section className="view active" aria-label="Overview">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Command centre</span>
          <h1>
            The morning, <span className="serif">briefed.</span>
          </h1>
          <p className="meta">{today} · live workspace data</p>
        </div>
        <div className="vh-side">
          <span className="chip">
            <b className="stat">{nf.format(data.wardsTotal)}</b>&nbsp;wards covered
          </span>
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> Synced just now
          </span>
        </div>
      </div>

      <div className="g5 fx2">
        <div className="card kpi">
          <span className="kpi-lbl">Consented supporters</span>
          <span className="kpi-val stat">{nf.format(data.supporters)}</span>
          <div className="minibar" role="img" aria-label={`${supporterPct.toFixed(1)} percent of target`}>
            <i style={{ width: `${Math.min(supporterPct, 100)}%` }} />
          </div>
          <span className="kpi-sub">
            of {nf.format(data.supporterTarget)} target · {supporterPct.toFixed(1)}%
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Wards on track</span>
          <span className="kpi-val stat">
            {data.wardsOnTrack}
            <span className="dim">/{data.wardsTotal}</span>
          </span>
          <span className="pill pill--amber">
            <span className="g" aria-hidden="true">
              ◐
            </span>{" "}
            {data.wardsTotal - data.wardsOnTrack} behind pace
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Contacts this week</span>
          <span className="kpi-val stat">{nf.format(data.contactsThisWeek)}</span>
          <span className="delta">
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% on last week
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Spend vs limit</span>
          <span className="kpi-val stat">{spendPct.toFixed(1)}%</span>
          <div className="minibar" role="img" aria-label={`${spendPct.toFixed(1)} percent of statutory limit`}>
            <i style={{ width: `${Math.min(spendPct, 100)}%` }} />
          </div>
          <span className="kpi-sub">
            KES {(data.spendKes / 1_000_000).toFixed(1)}M of{" "}
            {(data.statutoryLimit / 1_000_000).toFixed(1)}M statutory
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">
            Biggest gap · {data.biggestGap?.name ?? "—"}
          </span>
          <span className="kpi-val stat">
            {data.biggestGap ? nf.format(data.biggestGap.gap) : "—"}
          </span>
          <span className="kpi-sub">votes vs ward target · canvass surge queued</span>
        </div>
      </div>

      <div className="x-row fx3">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Consented supporters</h2>
              <p className="meta">Last 8 months · all capture channels</p>
            </div>
            <span className="mono">
              {nf.format(data.supporters)} · {supporterPct.toFixed(1)}% of target
            </span>
          </div>
          <div className="spark-wrap">
            <svg
              id="spark"
              viewBox="0 0 560 128"
              width="100%"
              height="128"
              role="img"
              aria-label="Consented supporters over the last eight months"
            >
              <line
                x1="20"
                y1="12"
                x2="540"
                y2="12"
                stroke="var(--gw-border)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text
                x="540"
                y="8"
                textAnchor="end"
                fontFamily="JetBrains Mono, monospace"
                fontSize="9"
                letterSpacing="1"
                fill="hsl(150 6% 40%)"
              >
                TARGET {nf.format(data.supporterTarget)}
              </text>
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke="hsl(158 15% 10%)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={last[0]}
                cy={last[1]}
                r="4"
                fill="hsl(158 15% 10%)"
                stroke="hsl(60 10% 97%)"
                strokeWidth="2"
              />
            </svg>
            <div className="spark-months" aria-hidden="true">
              {data.growth.map((g, i) => (
                <span key={`${g.label}-${i}`}>{g.label}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Wards off pace</h2>
            <span className="mono">
              worst {data.offPace.length} of {data.wardsTotal - data.wardsOnTrack}
            </span>
          </div>
          <div className="wardlist">
            {data.offPace.map((w) => (
              <div className="wardlist-row" key={w.name}>
                <span className="wardlist-name">
                  {w.name}
                  <small>{w.constituency}</small>
                </span>
                <span className="wardlist-gap">{nf.format(w.gap)}</span>
              </div>
            ))}
          </div>
          <p className="f-note">Gap = consented supporters vs ward win-number pace.</p>
        </div>
      </div>

      <p className="x-caption eyebrow fx4">
        Five numbers · everything else is one click down
      </p>
    </section>
  );
}
