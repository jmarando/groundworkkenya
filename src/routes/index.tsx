import { createFileRoute, Link } from "@tanstack/react-router";

import { GwMark } from "@/components/gw/GwMark";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Groundwork · the campaign OS" },
      {
        name: "description",
        content:
          "Groundwork is the campaign operating system for Kenyan county campaigns: consented supporter data, ward targeting, SMS and USSD polling, and compliant campaign finance.",
      },
      { property: "og:title", content: "Groundwork · the campaign OS" },
      {
        property: "og:description",
        content:
          "Consented supporter data, ward targeting, SMS and USSD polling, and compliant campaign finance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Landing() {
  return (
    <div className="landing">
      <header className="landing-top">
        <span className="landing-brand">
          <GwMark />
          <span className="sb-brand-name">groundwork</span>
        </span>
        <Link to="/auth" className="btn btn--ghost btn--sm">
          Sign in
        </Link>
      </header>

      <main className="landing-main">
        <span className="eyebrow">The campaign OS · Nairobi County</span>
        <h1>
          Win the ward. <span className="serif">Keep the receipts.</span>
        </h1>
        <p className="landing-lede">
          One workspace for consented supporter data, ward-level targeting, SMS and USSD
          polling, field agents on election day, and campaign finance that survives an audit.
        </p>
        <div className="landing-cta">
          <Link to="/auth" className="btn btn--primary">
            Enter the console
          </Link>
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> Nairobi workspace · 2027 cycle
          </span>
        </div>

        <div className="landing-grid">
          <div className="card kpi">
            <span className="kpi-lbl">People</span>
            <span className="kpi-val stat">CRM</span>
            <span className="kpi-sub">Consent recorded per channel, re-checked at send time.</span>
          </div>
          <div className="card kpi">
            <span className="kpi-lbl">Polling</span>
            <span className="kpi-val stat">SMS · USSD</span>
            <span className="kpi-sub">Ask a ward a question, weight the answer, act on it.</span>
          </div>
          <div className="card kpi">
            <span className="kpi-lbl">Finance</span>
            <span className="kpi-val stat">Statutory</span>
            <span className="kpi-sub">Append-only ledger against the expenditure limit.</span>
          </div>
          <div className="card kpi">
            <span className="kpi-lbl">Election day</span>
            <span className="kpi-val stat">War room</span>
            <span className="kpi-sub">Station reporting, turnout and incident triage.</span>
          </div>
        </div>
      </main>

      <footer className="landing-foot">
        <span className="mono">groundwork.co.ke</span>
      </footer>
    </div>
  );
}
