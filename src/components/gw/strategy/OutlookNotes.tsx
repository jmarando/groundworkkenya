import type { Note } from "@/lib/outlook-notes";

const TOPICS: { id: string; name: string }[] = [
  { id: "youth", name: "Young voters and the protests" },
  { id: "register", name: "The register" },
  { id: "world", name: "Around the world" },
  { id: "parties", name: "Parties" },
  { id: "nairobi", name: "Nairobi" },
];
const KINDS: Record<Note["kind"], string> = {
  official: "Official figure",
  reported: "Press report",
  survey: "Survey or poll",
  statement: "Statement",
};
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "15 October 2026", or "February 2026" where the source gives only a month. */
function when(date: string): string {
  const [y, m, d] = date.split("-");
  const month = MONTHS[Number(m) - 1] ?? "";
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

/**
 * What has changed since 2022, each note with its date, its source and what to
 * remember reading it. The notes for the whole country and for this county.
 */
export function OutlookNotes({ notes, county }: { notes: Note[]; county: string }) {
  const mine = notes.filter((n) => n.place === "" || n.place === county);
  const groups = TOPICS.map((t) => ({
    ...t,
    notes: mine.filter((n) => n.topic === t.id).sort((a, b) => (a.date < b.date ? 1 : -1)),
  })).filter((g) => g.notes.length);
  if (!groups.length) return null;
  return (
    <details className="out-notes">
      <summary>
        What has changed since 2022 <span className="meta">{mine.length} dated, sourced notes</span>
      </summary>
      <p className="meta out-notes-intro">
        Each note says where it comes from and what to remember reading it. Counts that differ
        between sources are given as each source gives them, not added or averaged.
      </p>
      {groups.map((g) => (
        <section key={g.id} className="out-note-group">
          <h3>{g.name}</h3>
          <ul>
            {g.notes.map((n) => (
              <li key={n.id} className="out-note">
                <p className="out-note-head">
                  <time dateTime={n.date}>{when(n.date)}</time>
                  <span className="out-kind">{KINDS[n.kind]}</span>
                </p>
                <h4>{n.title}</h4>
                <p>{n.text}</p>
                {n.caveat ? <p className="out-caveat">{n.caveat}</p> : null}
                <p className="meta">
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    {n.source}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}
