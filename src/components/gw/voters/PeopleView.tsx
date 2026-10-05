import { useMemo, useState } from "react";

import type { PersonRow } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";
import {
  pageWithin,
  type ConsentFilter,
  type ContactFilter,
  type SearchChanges,
  type SupportFilter,
  type VotersSearch,
} from "@/lib/voters-view";

const nf = new Intl.NumberFormat("en-KE");
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "never";
const PAGE = 12;

const SUPPORT: [SupportFilter, string][] = [
  ["strong", "Strong 70+"],
  ["persuadable", "Persuadable 40–69"],
  ["against", "Against"],
  ["unscored", "Not scored"],
];
const CONSENT: [ConsentFilter, string][] = [
  ["sms", "SMS"],
  ["whatsapp", "WhatsApp"],
  ["call", "Calls"],
  ["none", "No consent"],
];
const CONTACT: [ContactFilter, string][] = [
  ["week", "This week"],
  ["month", "This month"],
  ["never", "Never"],
];

/** The area's people: the filters live in the address, the chosen record beside the list. */
export function PeopleView({
  rows,
  record,
  loading,
  search,
  onSearch,
  placeName,
  segments,
}: {
  /** In the area and matching the address's filters. */
  rows: PersonRow[];
  /** The record the address names, found among everyone (a filter can hide it from the list). */
  record: PersonRow | null;
  loading: boolean;
  search: VotersSearch;
  onSearch: (changes: SearchChanges) => void;
  placeName: string;
  /** The campaign's groups, for the group chips. */
  segments: { slug: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.phone.includes(needle) ||
            (r.ward ?? "").toLowerCase().includes(needle) ||
            r.tags.some((t) => t.toLowerCase().includes(needle)),
        )
      : [...rows];
    if (sort === "support") list.sort((a, b) => b.support - a.support);
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => Date.parse(b.lastTouch ?? "1970") - Date.parse(a.lastTouch ?? "1970"));
    return list;
  }, [rows, q, sort]);

  if (loading) return <p className="meta">Reading the records…</p>;

  const pages = Math.max(Math.ceil(shown.length / PAGE), 1);
  // The list can shrink under the page (a new area or filter from outside the list).
  const current = pageWithin(page, shown.length, PAGE);
  const pageRows = shown.slice(current * PAGE, current * PAGE + PAGE);
  const person = record ?? pageRows[0] ?? null;

  const group = <T extends string>(
    key: "support" | "consent" | "contact" | "segment",
    label: string,
    options: [T, string][],
  ) => (
    <div role="group" aria-label={label}>
      <span>{label}</span>
      {options.map(([value, name]) => (
        <button
          key={value}
          type="button"
          className="fchip"
          aria-pressed={search[key] === value}
          onClick={() => {
            onSearch({
              [key]: search[key] === value ? undefined : value,
              person: undefined,
            } as SearchChanges);
            setPage(0);
          }}
        >
          {name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="pgrid">
      <div className="card" style={{ minWidth: 0 }}>
        <div className="card-head" style={{ marginBottom: 10 }}>
          <div>
            <h2>People in {placeName}</h2>
            <p className="meta">{nf.format(shown.length)} matching</p>
          </div>
        </div>
        <div className="vt-filters">
          {group("support", "Support", SUPPORT)}
          {group("consent", "Consent", CONSENT)}
          {group("contact", "Contacted", CONTACT)}
          {segments.length
            ? group(
                "segment",
                "Group",
                segments.map((g): [string, string] => [g.slug, g.name]),
              )
            : null}
        </div>
        <div className="pbar">
          <label className="sr" htmlFor="vtQ">
            Search people
          </label>
          <input
            id="vtQ"
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
            <option value="support">Support score, high first</option>
            <option value="name">Name A–Z</option>
          </select>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              downloadCSV(
                stampName("groundwork-people"),
                [
                  "Name",
                  "Phone",
                  "Ward",
                  "Constituency",
                  "Segment",
                  "Source",
                  "Support score",
                  "Language",
                  "Consented channels",
                  "Tags",
                  "Opted out",
                  "Last contacted",
                  "Added",
                  "Notes",
                ],
                shown.map((r) => [
                  r.name,
                  r.phone,
                  r.ward ?? "",
                  r.constituency ?? "",
                  r.segment ?? "",
                  r.source,
                  r.support,
                  r.language,
                  r.channels.join(" "),
                  r.tags.join(" "),
                  r.optedOut ? "yes" : "no",
                  r.lastTouch ? r.lastTouch.slice(0, 10) : "",
                  r.createdAt.slice(0, 10),
                  r.notes ?? "",
                ]),
              )
            }
          >
            Download {nf.format(shown.length)} rows · CSV
          </button>
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
                <tr key={r.id} aria-selected={person?.id === r.id}>
                  <td>
                    <button
                      type="button"
                      className="vt-link"
                      onClick={() => onSearch({ person: r.id })}
                    >
                      {r.name}
                    </button>
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
          {shown.length === 0 ? <p className="f-note">No one here matches.</p> : null}
        </div>
        <div className="pager">
          <span className="meta">
            Page {current + 1} of {pages} · {nf.format(shown.length)} people
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setPage(Math.max(current - 1, 0))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setPage(Math.min(current + 1, pages - 1))}
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
              {[
                ["Ward", person.ward ?? "—"],
                ["Constituency", person.constituency ?? "—"],
                ["Segment", person.segment ?? "—"],
                ["Support score", person.support ? String(person.support) : "—"],
                ["Language", person.language.toUpperCase()],
                ["Consent", person.channels.join(" · ") || "none"],
                ["Opted out", person.optedOut ? "Yes" : "No"],
                ["Came from", person.source],
                ["Last touch", when(person.lastTouch)],
              ].map(([k, v]) => (
                <div className="f-row" key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
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
  );
}
