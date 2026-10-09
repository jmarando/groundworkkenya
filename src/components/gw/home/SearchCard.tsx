import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { toneVar } from "@/components/gw/demo/tone";
import { SearchChart } from "@/components/gw/home/SearchChart";
import { supabase } from "@/integrations/supabase/client";
import { dayName } from "@/lib/diary";
import type { RaceRival } from "@/lib/race-data";
import {
  monthAverages,
  PLACE_NAMES,
  searchChart,
  searchSummary,
  type SearchRead,
} from "@/lib/search-interest";
import { peakReasons, peakWindow, searchPeaks, type PeakMention } from "@/lib/search-peaks";

/** How much each candidate is searched for on Google: thirty days, read each morning. */
export function SearchCard({ read, rivals }: { read: SearchRead | null; rivals: RaceRival[] }) {
  const model = useMemo(() => searchChart(read, rivals), [read, rivals]);
  const averages = monthAverages(read, rivals);
  const peaks = useMemo(
    () => (model && read ? searchPeaks(model, read.series.map((t) => t.term)) : []),
    [model, read],
  );
  const from = peaks.length ? peakWindow(peaks[0]!.day).from : null;
  const to = peaks.length ? peakWindow(peaks[peaks.length - 1]!.day).to : null;

  // The news Listening found around the peaks; row level security keeps it to this campaign.
  const { data: mentions } = useQuery({
    queryKey: ["search-peak-news", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data } = await supabase
        .from("listening_mentions")
        .select("title, url, domain, snippet, published_at, found_at, reach")
        .gte("found_at", `${from}T00:00:00Z`)
        .lt("found_at", `${addOne(to!)}T00:00:00Z`)
        .order("found_at", { ascending: false })
        .limit(1000);
      return (data ?? []) as PeakMention[];
    },
  });

  const tones = new Map(model?.series.map((s) => [s.key, s.tone]) ?? []);

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
          <SearchChart model={model} peaks={peaks} />
          <p className="home-search-avg">
            This month&apos;s average:{" "}
            {averages.map((a, i) => (
              <span key={a.name}>
                {i ? " · " : ""}
                {a.name} <b>{a.average}</b>
              </span>
            ))}
          </p>
          {peaks.length ? (
            <div className="search-peaks">
              <h3>Why the peaks</h3>
              <ol>
                {peaks.map((p) => {
                  const why = mentions ? peakReasons(p, mentions) : [];
                  return (
                    <li key={`${p.key}-${p.day}`}>
                      <span
                        className="search-peak-n"
                        style={{ background: toneVar(tones.get(p.key) ?? "a") }}
                      >
                        {p.n}
                      </span>
                      <div>
                        <p className="search-peak-head">
                          <b>{p.label}</b> peaked at {p.value} on {dayName(p.day)}
                        </p>
                        {!mentions ? (
                          <p className="search-peak-none">Reading the news from then…</p>
                        ) : why.length ? (
                          <ul>
                            {why.map((m) => (
                              <li key={m.url}>
                                <a href={m.url} target="_blank" rel="noreferrer">
                                  {m.title ?? m.url}
                                </a>
                                {m.domain ? <span className="search-peak-src"> · {m.domain}</span> : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="search-peak-none">
                            Listening found no story naming {p.term} around then, so the cause isn&apos;t
                            on record.
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mb-source">
                Stories Listening found from two days before each peak to the day after that name
                the person. A likely reason, not a proven one.
              </p>
            </div>
          ) : null}
          <p className="mb-source">
            Searched as {read.series.map((t) => t.term).join(", ")} · {PLACE_NAMES[read.geo]} · 100
            is the busiest day of any of them · Google Trends via SerpApi, read {dayName(read.day)}.
          </p>
        </>
      ) : null}
    </section>
  );
}

const addOne = (d: string) => new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10);
