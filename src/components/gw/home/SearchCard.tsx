import { useMemo } from "react";

import { SearchChart } from "@/components/gw/home/SearchChart";
import { dayName } from "@/lib/diary";
import type { RaceRival } from "@/lib/race-data";
import {
  monthAverages,
  PLACE_NAMES,
  searchChart,
  searchSummary,
  type SearchRead,
} from "@/lib/search-interest";

/** How much each candidate is searched for on Google: thirty days, read each morning. */
export function SearchCard({ read, rivals }: { read: SearchRead | null; rivals: RaceRival[] }) {
  const model = useMemo(() => searchChart(read, rivals), [read, rivals]);
  const averages = monthAverages(read, rivals);
  return (
    <section className="card home-search" aria-labelledby="home-search-h">
      <div className="card-head">
        <div>
          <h2 id="home-search-h">Search interest, last 30 days</h2>
          <p className="meta">
            {!read
              ? "Read each morning from Google Trends once SerpApi is connected."
              : searchSummary(read, rivals) || "Too few searches to compare yet."}
          </p>
        </div>
      </div>
      {read && model ? (
        <>
          <SearchChart model={model} />
          <p className="home-search-avg">
            This month&apos;s average:{" "}
            {averages.map((a, i) => (
              <span key={a.name}>
                {i ? " · " : ""}
                {a.name} <b>{a.average}</b>
              </span>
            ))}
          </p>
          <p className="mb-source">
            Searched as {read.series.map((t) => t.term).join(", ")} · {PLACE_NAMES[read.geo]} · 100
            is the busiest day of any of them · Google Trends via SerpApi, read {dayName(read.day)}.
          </p>
        </>
      ) : null}
    </section>
  );
}
