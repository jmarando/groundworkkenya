import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/foundations")({
  component: Foundations,
  head: () => ({
    meta: [
      { title: "Foundations · Groundwork" },
      {
        name: "description",
        content: "The Groundwork brand and design system: mark, colour, type, status and rules.",
      },
      { property: "og:title", content: "Foundations · Groundwork" },
      {
        property: "og:description",
        content: "The Groundwork brand and design system: mark, colour, type, status and rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SWATCHES = [
  { n: "Soil", h: "#141C19", bg: "#141C19" },
  { n: "Stone", h: "#F5F5F0", bg: "#F5F5F0" },
  { n: "Murram", h: "#D9481C", bg: "#D9481C" },
  { n: "Reporting", h: "hsl(142 55% 34%)", bg: "hsl(142 55% 34%)" },
  { n: "On station", h: "hsl(38 92% 40%)", bg: "hsl(38 92% 40%)" },
  { n: "Missed", h: "hsl(0 70% 45%)", bg: "hsl(0 70% 45%)" },
];

const STATUSES = [
  { g: "●", name: "Reporting", d: "Live and sending. Green only when data arrived in the last cycle." },
  { g: "◐", name: "On station", d: "Present but not yet reporting. Amber is a prompt, not an alarm." },
  { g: "▲", name: "Missed", d: "Expected data did not arrive. Always paired with what to do next." },
  { g: "○", name: "Unstaffed", d: "Nobody assigned. Counted openly rather than hidden." },
];

function Mark({ size = 100 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Groundwork mark">
      <path d="M86 28V14H14V86H86V52H62" fill="none" stroke="currentColor" strokeWidth="13" />
      <rect x="40" y="45.5" width="13" height="13" fill="#D9481C" />
    </svg>
  );
}

function Foundations() {
  return (
    <section className="view active" aria-label="Brand and design system">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Brand · v1 · groundwork.co.ke</span>
          <h1>
            Groundwork, <span className="serif">the campaign OS.</span>
          </h1>
          <p className="meta">
            One system for the long game, the 48 hours, and the conversation in between.
          </p>
        </div>
      </div>

      <div className="fd-section fx2" style={{ marginTop: 4 }}>
        <span className="eyebrow">Mark</span>
        <div className="brand-grid">
          <div className="brand-tile" style={{ background: "hsl(60 10% 97%)", color: "#141C19" }}>
            <Mark size={120} />
            <span className="cap">Primary lockup · Soil on Stone</span>
          </div>
          <div className="brand-tile" style={{ background: "#141C19", color: "hsl(60 10% 96%)" }}>
            <Mark size={92} />
            <span className="cap">Reverse · Stone on Soil</span>
          </div>
        </div>
        <div className="brand-icons" style={{ marginTop: 14, color: "var(--foreground)" }}>
          <Mark size={64} />
          <Mark size={44} />
          <Mark size={30} />
          <Mark size={20} />
          <span className="meta">
            The gap in the G is the door you have not knocked on yet. The murram square is the
            record you just made.
          </span>
        </div>
      </div>

      <div className="fd-section fx3">
        <span className="eyebrow">Colour</span>
        <div className="sw-grid">
          {SWATCHES.map((s) => (
            <figure className="sw" key={s.n}>
              <i style={{ background: s.bg }} />
              <figcaption>
                <span className="n">{s.n}</span>
                <span className="h">{s.h}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="f-note">
          Murram is for one thing per screen: the action that matters. Status colour never carries
          meaning on its own — it always sits with a glyph and a word.
        </p>
      </div>

      <div className="fd-section fx4">
        <span className="eyebrow">Type</span>
        <div className="card spec">
          <div className="spec-row">
            <span className="spec-lbl">Display · Archivo Expanded</span>
            <div>
              <h2 style={{ margin: 0 }}>Every voter by name, ward and promise made.</h2>
              <span className="meta">Headlines only. Tight tracking, never below 22px.</span>
            </div>
          </div>
          <div className="spec-row">
            <span className="spec-lbl">Body · Geist</span>
            <div>
              <p style={{ margin: 0 }}>
                Plain sentences, short lines, no jargon. If a field agent cannot read it at arm&apos;s
                length on a cracked screen, rewrite it.
              </p>
            </div>
          </div>
          <div className="spec-row">
            <span className="spec-lbl">Data · JetBrains Mono</span>
            <div>
              <span className="mono">KES 433,800,000 · 85 wards · 1,200 records</span>
              <span className="meta" style={{ display: "block" }}>
                Every number, code, reference and timestamp.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="fd-section fx5">
        <span className="eyebrow">Status language</span>
        <div className="card">
          <table className="st-table">
            <tbody>
              {STATUSES.map((s) => (
                <tr key={s.name}>
                  <td className="st-g">{s.g}</td>
                  <td className="st-name">{s.name}</td>
                  <td className="st-desc">{s.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fd-section">
        <span className="eyebrow">Components</span>
        <div className="comp-grid">
          <div className="card comp">
            <h3>Buttons</h3>
            <div className="comp-row">
              <button type="button" className="btn btn--primary">
                Schedule send
              </button>
              <button type="button" className="btn btn--ghost">
                Cancel
              </button>
              <button type="button" className="btn btn--ghost btn--sm">
                Small
              </button>
            </div>
          </div>
          <div className="card comp">
            <h3>Consent badges</h3>
            <div className="comp-row">
              <span className="consent-badge cb--ok">
                SMS <span className="sc">consented</span>
              </span>
              <span className="consent-badge cb--exp">
                Call <span className="sc">expiring</span>
              </span>
              <span className="consent-badge cb--out">
                Email <span className="sc">opted out</span>
              </span>
              <span className="consent-badge cb--blocked">
                WhatsApp <span className="sc">no campaign API</span>
              </span>
            </div>
          </div>
          <div className="card comp">
            <h3>Status pills</h3>
            <div className="comp-row">
              <span className="pill pill--ok">
                <span className="g" aria-hidden="true">
                  ●
                </span>{" "}
                Reporting
              </span>
              <span className="pill pill--amber">
                <span className="g" aria-hidden="true">
                  ◐
                </span>{" "}
                On station
              </span>
              <span className="pill pill--outline-red">
                <span className="g" aria-hidden="true">
                  ▲
                </span>{" "}
                Missed
              </span>
            </div>
          </div>
          <div className="card comp">
            <h3>Statutory limit</h3>
            <div className="limit-track">
              <i className="limit-fill" style={{ width: "38%" }} />
              <span className="limit-tick" style={{ left: "80%" }} />
            </div>
            <div className="limit-labels">
              <span className="mono">KES 164.8M spent</span>
              <span className="mono">limit KES 433.8M</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fd-section">
        <span className="eyebrow">Rules</span>
        <div className="card dodont">
          <ul>
            <li>
              <span className="k k--do">DO</span> Show the number and where it came from.
            </li>
            <li>
              <span className="k k--do">DO</span> Name the person, the ward and the promise.
            </li>
            <li>
              <span className="k k--do">DO</span> Say plainly when data is stale.
            </li>
            <li>
              <span className="k k--do">DO</span> Keep consent visible at the point of sending.
            </li>
          </ul>
          <ul>
            <li>
              <span className="k k--dont">DON&apos;T</span> Invent a projection and style it as a
              fact.
            </li>
            <li>
              <span className="k k--dont">DON&apos;T</span> Profile anyone by ethnicity or religion.
            </li>
            <li>
              <span className="k k--dont">DON&apos;T</span> Use colour alone to carry a status.
            </li>
            <li>
              <span className="k k--dont">DON&apos;T</span> Bury the cost of a send.
            </li>
          </ul>
        </div>
      </div>

      <p className="quiet-line">Groundwork · brand and product system v1</p>
    </section>
  );
}
