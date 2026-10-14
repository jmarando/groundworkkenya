import { Link } from "@tanstack/react-router";

import { FindingItem } from "@/components/gw/findings/FindingItem";
import { useFindings } from "@/hooks/useFindings";
import { forPlace, type Decision, type Finding } from "@/lib/findings/core";

/** A screen's few findings, and the way to the rest on Strategy. Nothing when there are none. */
export function SoWhat({
  title,
  findings,
  place = null,
  card = true,
}: {
  title: string;
  findings: Finding[];
  place?: string | null;
  card?: boolean;
}) {
  if (!findings.length) return null;
  return (
    <section className={card ? "card fd-card" : "fd-card"} aria-label={title}>
      <div className="card-head">
        <h2>{title}</h2>
        <Link to="/strategy" search={place ? { place } : {}} className="mono">
          See all findings
        </Link>
      </div>
      <ul className="fd-list">
        {findings.map((f) => (
          <FindingItem key={f.id} f={f} />
        ))}
      </ul>
    </section>
  );
}

/** The findings about a place and the places inside it (null: everywhere), from the shared read. */
export function PlaceFindings({
  place,
  max,
  decisions,
  title = "So what here",
  card = true,
}: {
  place: string | null;
  max: number;
  decisions?: Decision[];
  title?: string;
  card?: boolean;
}) {
  const { data } = useFindings();
  if (!data) return null;
  const here = forPlace(data.findings, place, false)
    .filter((f) => !decisions || decisions.includes(f.decision))
    .slice(0, max);
  return <SoWhat title={title} findings={here} place={place} card={card} />;
}
