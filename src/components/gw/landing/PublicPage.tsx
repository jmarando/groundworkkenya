import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { TIERS, ksh } from "@/lib/pricing";
import type { Faq } from "@/lib/faq";

// The pieces of the public pages (/election-night, /polling, /voters-map, /pricing, /faq). They use
// the home page's styles (src/styles/gw-landing.css) so every page looks like one site.

function Mark({ stroke }: { stroke: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M86 28V14H14V86H86V52H62" fill="none" stroke={stroke} strokeWidth="13" />
      <rect x="40" y="45.5" width="13" height="13" fill="#D9481C" />
    </svg>
  );
}

function SiteHeader() {
  return (
    <header className="nav">
      <div className="wrap">
        <Link className="brand" to="/" aria-label="groundwork home">
          <Mark stroke="#141C19" />
          <b>groundwork</b>
        </Link>
        <nav className="nav-links" aria-label="Pages">
          <Link to="/voters-map">Voters map</Link>
          <Link to="/sms-ussd-polls">Polling</Link>
          <Link to="/election-night">Election night</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/faq">FAQ</Link>
        </nav>
        <span className="spacer" />
        <Link to="/auth" className="btn btn-o btn-s">
          Sign in
        </Link>
        <Link className="btn btn-m btn-s" to="/" hash="demo">
          Book a demo
        </Link>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <div>
          <Link className="brand" to="/">
            <Mark stroke="#F5F5F0" />
            <b>groundwork</b>
          </Link>
          <p style={{ marginTop: 14, maxWidth: "34ch" }}>
            The campaign OS. Every voter known, every shilling accounted for, every vote counted.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <Link to="/voters-map">Voters map</Link>
          <Link to="/sms-ussd-polls">Polling</Link>
          <Link to="/election-night">Election night</Link>
          <Link to="/pricing">Pricing</Link>
        </div>
        <div>
          <h4>Company</h4>
          <Link to="/" hash="trust">
            Trust
          </Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/" hash="demo">
            Book a demo
          </Link>
          <Link to="/privacy">Privacy</Link>
        </div>
        <div>
          <h4>Guides</h4>
          <Link to="/guides">All guides</Link>
          <Link to="/guides/2027-election-dates">2027 election dates</Link>
          <Link to="/guides/2027-campaign-spending-limits">Spending limits</Link>
          <Link to="/guides/how-a-parallel-tally-works">Parallel tally</Link>
        </div>
        <div>
          <h4>Account</h4>
          <Link to="/auth">Sign in</Link>
          <a href="mailto:justin@glab.africa">justin@glab.africa</a>
        </div>
        <div className="base">
          <span>© 2026 Groundwork · groundwork.ke</span>
          <span>Groundwork reports; the IEBC declares.</span>
        </div>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="gw-landing">
      <SiteHeader />
      <main id="top">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** The dark band that opens a page: what it is, in one line a reader or a crawler can quote. */
export function PageIntro({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: string;
}) {
  return (
    <div className="hero page">
      <div className="wrap">
        <span className="eyebrow">
          <i /> {eyebrow}
        </span>
        <h1>{title}</h1>
        <p className="hero-sub">{lead}</p>
        <div className="hero-cta">
          <Link className="btn btn-m" to="/" hash="demo">
            Book a demo
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Questions and answers as plain headings and paragraphs, in the page for anyone to read. */
export function Qa({ items }: { items: Faq[] }) {
  return (
    <div className="qa">
      {items.map((f) => (
        <article key={f.q}>
          <h2>{f.q}</h2>
          <p>{f.a}</p>
        </article>
      ))}
    </div>
  );
}

/** The closing band: the same offer as the home page's demo form, which it links to. */
export function Cta() {
  return (
    <section className="cta">
      <div className="wrap">
        <div>
          <span className="eyebrow">Book a demo</span>
          <h2>See your ward on the map.</h2>
          <p>
            Tell us the seat you're running for. We'll show you Groundwork with your own wards
            loaded, in 30 minutes.
          </p>
        </div>
        <Link className="btn btn-m" to="/" hash="demo">
          Book a demo
        </Link>
      </div>
    </section>
  );
}

/** The four seats and what each pays. `local` keeps the demo links as in-page anchors (the home page). */
export function TierGrid({ local = false }: { local?: boolean }) {
  return (
    <div className="tiers">
      {TIERS.map((t) => {
        const className = t.highlight ? "btn btn-m btn-s" : "btn btn-o btn-s";
        return (
          <div className={t.highlight ? "tier hl" : "tier"} key={t.id}>
            <span className="who">{t.seat}</span>
            <h3>{t.name}</h3>
            <span className="n">{t.size}</span>
            {t.monthly !== null && (
              <span className="price">
                {ksh(t.monthly)}
                <small>a month</small>
              </span>
            )}
            <ul>
              {t.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {local ? (
              <a className={className} href="#demo">
                {t.cta}
              </a>
            ) : (
              <Link className={className} to="/" hash="demo">
                {t.cta}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
