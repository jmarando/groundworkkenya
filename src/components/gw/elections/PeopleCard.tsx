import { votes, whole, type AreaFigures } from "@/lib/atlas-view";

/** What an area's parts are called, for "its 6 wards added up". */
const PARTS: Partial<Record<AreaFigures["level"], string>> = {
  constituency: "wards",
  county: "constituencies",
  country: "counties",
};

/** Who lives here (estimates) against the register. */
export function PeopleCard({ f }: { f: AreaFigures }) {
  const p = f.population;
  const rows: [string, string][] = [
    ["People (estimate)", p ? votes(p.total) : "—"],
    ["Adults (estimate)", p ? votes(p.adults) : "—"],
    ["Aged 18–34, share of adults", p && p.adults ? whole(p.youngAdults / p.adults) : "—"],
    ["Registered voters (2022)", f.registered === null ? "—" : votes(f.registered)],
    ["Adults not registered (estimate)", f.notRegistered ? votes(f.notRegistered.adults) : "—"],
  ];
  return (
    <section className="card">
      <div className="card-head">
        <h2>Who lives here</h2>
        {p ? (
          <span className="mono">
            WorldPop estimate · {p.year}
            {f.populationParts
              ? ` · its ${f.populationParts} ${PARTS[f.level] ?? "parts"} added up`
              : ""}
          </span>
        ) : null}
      </div>
      <div className="f-rows">
        {rows.map(([k, v]) => (
          <div className="f-row" key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {f.estimateBelowRegister ? (
        <p className="f-note">
          More people are registered here than the estimate has adults: people often register where
          they work, and the estimate is rough at this size. It can't say who isn't registered here.
        </p>
      ) : null}
    </section>
  );
}
