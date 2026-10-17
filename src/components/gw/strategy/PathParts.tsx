import { Fragment, useState } from "react";

import type { PathLine } from "@/lib/path-lines";

/** One reading, with its figures and sources on request, as the findings have. */
export function Reading({ r }: { r: PathLine }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="fd-item">
      <div className="fd-body">
        <p className="fd-line">{r.line}</p>
        <div className="fd-actions">
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
            {r.figures.map((x, i) => (
              <Fragment key={i}>
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

export function Tile({
  label,
  value,
  sub,
  ok,
}: {
  label: string;
  value: string;
  sub: string;
  /** Whether the bar this tile shows is cleared; null for a tile that is no bar. */
  ok: boolean | null;
}) {
  return (
    <div className="card pth-tile" data-ok={ok === null ? undefined : String(ok)}>
      <span className="pth-lbl">{label}</span>
      <span className="pth-val stat">{value}</span>
      <span className="pth-sub">{sub}</span>
    </div>
  );
}
