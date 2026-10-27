import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { Source } from "@/lib/brief";
import { formatDay } from "@/lib/election-dates";
import { CHECKED, GUIDES, type GuidePath, type Statement } from "@/lib/guides";

// The pieces of the guides under /guides. They sit inside PublicPage and use the landing styles
// (src/styles/gw-landing.css), so a guide looks like the rest of the site. Every fact in a guide is
// followed by a link to the page that prints it.

/** A link to a source, worded as the page words it (the source's own label unless told otherwise). */
export function Cite({ s, children }: { s: Source; children?: ReactNode }) {
  return (
    <a href={s.url ?? undefined} rel="noopener">
      {children ?? s.label}
    </a>
  );
}

/** The one readable column a guide is written in. */
export function GuideBody({ children }: { children: ReactNode }) {
  return (
    <section>
      <div className="wrap">
        <div className="guide">{children}</div>
      </div>
    </section>
  );
}

/** When the guide's facts were last checked: the same day as its sitemap entry. */
export function Checked() {
  return (
    <p className="checked">
      Checked {formatDay(CHECKED, false)} against the sources listed at the end.
    </p>
  );
}

/** A boxed note: what is uncertain, or what the reader should know before reading on. */
export function Status({
  title,
  tone = "amber",
  children,
}: {
  title: string;
  tone?: "amber" | "info";
  children: ReactNode;
}) {
  return (
    <aside className={tone === "info" ? "status info" : "status"}>
      <b>{title}</b>
      {children}
    </aside>
  );
}

/** Statements as a list, each ending in the link to where it is printed. */
export function Statements({ items }: { items: Statement[] }) {
  return (
    <ul>
      {items.map((s) => (
        <li key={s.says}>
          {s.says} (<Cite s={s.from}>{s.ref}</Cite>)
        </li>
      ))}
    </ul>
  );
}

/** The sources a guide rests on, with the date each was published when it has one. */
export function Sources({ items }: { items: Source[] }) {
  return (
    <>
      <h2 id="sources">Sources</h2>
      <ol className="sources">
        {items.map((s) => (
          <li key={s.url}>
            <Cite s={s} />
            {s.date ? <span className="mono"> · {formatDay(s.date, false)}</span> : null}
          </li>
        ))}
      </ol>
    </>
  );
}

const LINKS: Record<GuidePath, ReactNode> = {
  "/guides/2027-election-dates": <Link to="/guides/2027-election-dates">2027 election dates</Link>,
  "/guides/2027-campaign-spending-limits": (
    <Link to="/guides/2027-campaign-spending-limits">2027 campaign spending limits</Link>
  ),
  "/guides/how-a-parallel-tally-works": (
    <Link to="/guides/how-a-parallel-tally-works">How a parallel tally works</Link>
  ),
};

/** The other guides, one line each. */
export function MoreGuides({ current }: { current: GuidePath }) {
  return (
    <>
      <h2>More guides</h2>
      <ul>
        {GUIDES.filter((g) => g.path !== current).map((g) => (
          <li key={g.path}>
            {LINKS[g.path]}: {g.summary}
          </li>
        ))}
      </ul>
    </>
  );
}
