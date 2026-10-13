import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";

import type { Finding, Next } from "@/lib/findings/core";

/** Where a finding leads. */
export function NextLink({ next }: { next: Next }) {
  return (
    <Link
      to={next.to as never}
      search={(next.search ?? {}) as never}
      {...(next.hash ? { hash: next.hash } : {})}
      className="btn btn--ghost btn--sm"
    >
      {next.label}
    </Link>
  );
}

/** One finding: its line, its next step, and its figures and sources on request. */
export function FindingItem({ f, n }: { f: Finding; n?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="fd-item">
      {n !== undefined ? <span className="fd-n">{n}</span> : null}
      <div className="fd-body">
        <p className="fd-line">{f.line}</p>
        <div className="fd-actions">
          <NextLink next={f.next} />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            Figures and sources
          </button>
        </div>
        {open ? (
          <dl className="fd-figs">
            {f.figures.map((x, k) => (
              <Fragment key={k}>
                <dt>{x.label}</dt>
                <dd>
                  {x.text}{" "}
                  <span className="meta">
                    {x.source} · {x.period}
                  </span>
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  );
}
