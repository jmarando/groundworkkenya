import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getPeople, type PersonRow } from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/people")({
  component: People,
  head: () => ({
    meta: [
      { title: "People · Groundwork" },
      {
        name: "description",
        content: "Consented supporter records with ward, segment, source and contact history.",
      },
      { property: "og:title", content: "People · Groundwork" },
      {
        property: "og:description",
        content: "Consented supporter records with ward, segment, source and contact history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    : "never";

const PAGE = 12;

function People() {
  const fetchPeople = useServerFn(getPeople);
  const { data } = useQuery({ queryKey: ["people"], queryFn: () => fetchPeople() });

  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [segment, setSegment] = useState<string | null>(null);
  const [ward, setWard] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<PersonRow | null>(null);

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => {
      if (segment && r.segment !== segment) return false;
      if (ward && r.ward !== ward) return false;
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      return (
        r.name.toLowerCase().includes(needle) ||
        r.phone.includes(needle) ||
        (r.ward ?? "").toLowerCase().includes(needle) ||
        r.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
    if (sort === "support") list.sort((a, b) => b.support - a.support);
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else
      list.sort(
        (a, b) => new Date(b.lastTouch ?? 0).getTime() - new Date(a.lastTouch ?? 0).getTime(),
      );
    return list;
  }, [data, q, sort, segment, ward]);

  if (!data) {
    return (
      <section className="view active" aria-label="People">
        <div className="vh">
          <div>
            <span className="eyebrow">People · one record per person</span>
            <h1>
              Everyone, <span className="serif">in one place.</span>
            </h1>
            <p className="meta">Loading records…</p>
          </div>
        </div>
      </section>
    );
  }

  const maxSource = Math.max(...data.bySource.map((s) => s.count), 1);
  const pages = Math.max(Math.ceil(rows.length / PAGE), 1);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const person = selected ?? pageRows[0] ?? null;
  const contactablePct = data.total ? (data.contactable / data.total) * 100 : 0;

  return (
    <section className="view active" aria-label="People">
      <div className="vh fx">
        <div>
          <span className="eyebrow">People · one record per person</span>
          <h1>
            Everyone, <span className="serif">in one place.</span>
          </h1>
          <p className="meta">
            Every door knock, rally check-in, poll reply and sign-up lands on the same record.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(data.total)} records loaded
          </span>
        </div>
      </div>

      <div className="g5 fx2">
        <div className="card kpi">
          <span className="kpi-lbl">People on file</span>
          <span className="kpi-val stat">{nf.format(data.total)}</span>
          <span className="kpi-sub">one record each, after merges</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Contactable</span>
          <span className="kpi-val stat">{nf.format(data.contactable)}</span>
          <div className="minibar">
            <i style={{ width: `${contactablePct}%` }} />
          </div>
          <span className="kpi-sub">{contactablePct.toFixed(1)}% opted in to a channel</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Supporters 4–5</span>
          <span className="kpi-val stat">{nf.format(data.supporters45)}</span>
          <span className="kpi-sub">of {nf.format(data.scored)} with a score</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Segments</span>
          <span className="kpi-val stat">{data.segments.length}</span>
          <span className="kpi-sub">{data.wards.length} wards represented</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Added today</span>
          <span className="kpi-val stat pulse-counter">{nf.format(data.addedToday)}</span>
          <span className="kpi-sub">new records since midnight</span>
        </div>
      </div>

      <div className="card fx3" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Where records come in</h2>
            <p className="meta">Every channel writes to the same list.</p>
          </div>
          <span className="mono">all sources</span>
        </div>
        <div className="barlist">
          {data.bySource.map((s) => (
            <div className="barlist-row" key={s.name}>
              <span className="lbl">{s.name}</span>
              <span className="barlist-track">
                <i style={{ width: `${(s.count / maxSource) * 100}%` }} />
              </span>
              <span className="val">{nf.format(s.count)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pgrid fx4">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head" style={{ marginBottom: 10 }}>
            <div>
              <h2>{ward ?? "All wards"}</h2>
              <p className="meta">
                {nf.format(rows.length)} matching {segment ? `· ${segment}` : ""}
              </p>
            </div>
            <div className="seg" role="group" aria-label="Ward">
              <button
                type="button"
                aria-pressed={ward === null}
                onClick={() => {
                  setWard(null);
                  setPage(0);
                }}
              >
                All {data.wards.length}
              </button>
              {data.wards.slice(0, 3).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={ward === w.name}
                  onClick={() => {
                    setWard(w.name);
                    setPage(0);
                  }}
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>

          <div className="segs">
            {data.segments.map((s) => (
              <button
                key={s.slug}
                type="button"
                className="fchip"
                aria-pressed={segment === s.slug}
                onClick={() => {
                  setSegment(segment === s.slug ? null : s.slug);
                  setPage(0);
                }}
              >
                {s.name} · {nf.format(s.count)}
              </button>
            ))}
          </div>

          <div className="pbar">
            <label className="sr" htmlFor="pplQ">
              Search people
            </label>
            <input
              id="pplQ"
              type="search"
              placeholder="Search name, phone, ward, tag"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              <option value="recent">Most recent touch</option>
              <option value="support">Support, high first</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          <div className="tblwrap">
            <table className="tbl ptbl">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Where</th>
                  <th>Support</th>
                  <th>Segment</th>
                  <th>Came from</th>
                  <th>Channels</th>
                  <th>Last touch</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{ cursor: "pointer" }}
                    aria-selected={person?.id === r.id}
                  >
                    <td>
                      <b>{r.name}</b>
                      <br />
                      <span className="mono dim">{r.phone}</span>
                    </td>
                    <td className="meta">
                      {r.ward ?? "—"}
                      <br />
                      <span className="dim">{r.constituency ?? ""}</span>
                    </td>
                    <td className="num">{r.support || "—"}</td>
                    <td className="meta">{r.segment ?? "—"}</td>
                    <td className="meta">{r.source}</td>
                    <td className="meta">{r.channels.join(" · ") || "none"}</td>
                    <td className="meta">{when(r.lastTouch)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <span className="meta">
              Page {page + 1} of {pages} · {nf.format(rows.length)} people
            </span>
            <span className="spacer" />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPage((p) => Math.min(p + 1, pages - 1))}
            >
              Next
            </button>
          </div>
        </div>

        <div className="card prec">
          {person ? (
            <>
              <div className="prec-top">
                <span className="prec-av" aria-hidden="true">
                  {person.name.slice(0, 1)}
                </span>
                <div>
                  <b>{person.name}</b>
                  <div className="mono dim">{person.phone}</div>
                </div>
              </div>
              <div className="f-rows">
                <div className="f-row">
                  <span>Ward</span>
                  <b>{person.ward ?? "—"}</b>
                </div>
                <div className="f-row">
                  <span>Constituency</span>
                  <b>{person.constituency ?? "—"}</b>
                </div>
                <div className="f-row">
                  <span>Segment</span>
                  <b>{person.segment ?? "—"}</b>
                </div>
                <div className="f-row">
                  <span>Support score</span>
                  <b className="stat">{person.support || "—"}</b>
                </div>
                <div className="f-row">
                  <span>Language</span>
                  <b>{person.language.toUpperCase()}</b>
                </div>
                <div className="f-row">
                  <span>Consent</span>
                  <b>{person.channels.join(" · ") || "none"}</b>
                </div>
                <div className="f-row">
                  <span>Opted out</span>
                  <b>{person.optedOut ? "Yes" : "No"}</b>
                </div>
                <div className="f-row">
                  <span>Came from</span>
                  <b>{person.source}</b>
                </div>
                <div className="f-row">
                  <span>Last touch</span>
                  <b>{when(person.lastTouch)}</b>
                </div>
              </div>
              {person.tags.length > 0 && (
                <div className="cv-tags" style={{ marginTop: 10 }}>
                  {person.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {person.notes && <p className="f-note">{person.notes}</p>}
            </>
          ) : (
            <p className="f-note">Pick a person to see their record.</p>
          )}
        </div>
      </div>

      <div className="g2 fx5" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Possible duplicates</h2>
              <p className="meta">Same phone number on more than one record</p>
            </div>
            <span className="mono">{data.duplicates.length} to review</span>
          </div>
          {data.duplicates.length === 0 && (
            <p className="f-note">No duplicate phone numbers in the loaded records.</p>
          )}
          {data.duplicates.map((d) => (
            <div className="dup" key={d.phone}>
              <b className="mono">{d.phone}</b>
              <span className="meta"> · {d.names.join(" / ")}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Consent, in the open</h2>
            <span className="mono">per person, per channel</span>
          </div>
          <div className="f-rows">
            <div className="f-row">
              <span>SMS consented</span>
              <b className="stat">
                {nf.format(data.rows.filter((r) => r.channels.includes("SMS") && !r.optedOut).length)}
              </b>
            </div>
            <div className="f-row">
              <span>WhatsApp consented</span>
              <b className="stat">
                {nf.format(data.rows.filter((r) => r.channels.includes("WA") && !r.optedOut).length)}
              </b>
            </div>
            <div className="f-row">
              <span>Calls consented</span>
              <b className="stat">
                {nf.format(
                  data.rows.filter((r) => r.channels.includes("Call") && !r.optedOut).length,
                )}
              </b>
            </div>
            <div className="f-row">
              <span>Opted out</span>
              <b className="stat">{nf.format(data.rows.filter((r) => r.optedOut).length)}</b>
            </div>
          </div>
          <p className="f-note">
            Anyone outside the consent scope drops out of every send, automatically.
          </p>
        </div>
      </div>
    </section>
  );
}
