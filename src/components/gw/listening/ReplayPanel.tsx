// The data side of Replay: reads the week, month or dates chosen, and opens a day's posts (read by
// date, so a past day is not capped at the latest 600). The screen is Replay.tsx.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Drill, type React } from "@/components/gw/listening/Overview";
import { ReplayView } from "@/components/gw/listening/Replay";
import { QueryState } from "@/components/gw/QueryState";
import { mondayOf, shortDay } from "@/lib/field-plan";
import { getListeningPosts } from "@/lib/listening-history.functions";
import type { Mention } from "@/lib/listening.functions";
import { addDays, nairobiToday } from "@/lib/nairobi-date";
import { periodFor, type Period } from "@/lib/replay";
import { getReplay } from "@/lib/replay.functions";

type Mark = (ids: string[], status: "new" | "actioned") => void;
type Opened = { day: string; posts: Mention[]; next: string | null };

/** Last week, Monday to Sunday: what someone asking to play back last week means. */
const lastWeek = (): Period => periodFor("week", addDays(mondayOf(nairobiToday()), -1));

export function ReplayPanel({ busy, mark, react }: { busy: boolean; mark: Mark; react?: React }) {
  const fetchReplay = useServerFn(getReplay);
  const fetchPosts = useServerFn(getListeningPosts);
  const [period, setPeriod] = useState<Period>(lastWeek);
  const [compare, setCompare] = useState(true);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["replay", period.from, period.to],
    queryFn: () => fetchReplay({ data: { from: period.from, to: period.to } }),
  });

  const openDay = async (day: string) => {
    setProblem(null);
    setLoading(true);
    try {
      const page = await fetchPosts({ data: { from: day, to: day } });
      setOpened({ day, posts: page.posts, next: page.next });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Those posts could not be read.");
    } finally {
      setLoading(false);
    }
  };

  const more = async () => {
    if (!opened?.next) return;
    setProblem(null);
    setLoading(true);
    try {
      const page = await fetchPosts({
        data: { from: opened.day, to: opened.day, cursor: opened.next },
      });
      setOpened({ ...opened, posts: [...opened.posts, ...page.posts], next: page.next });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Those posts could not be read.");
    } finally {
      setLoading(false);
    }
  };

  // The posts here were read once, so a mark shows on them at once as well as on the page.
  const markHere: Mark = (ids, status) => {
    mark(ids, status);
    setOpened((o) =>
      o ? { ...o, posts: o.posts.map((p) => (ids.includes(p.id) ? { ...p, status } : p)) } : o,
    );
  };

  if (opened) {
    return (
      <>
        <Drill
          focus={{ label: `Posts found on ${shortDay(opened.day)}` }}
          posts={opened.posts}
          back={() => setOpened(null)}
          backLabel="← Replay"
          busy={busy}
          mark={markHere}
          react={react}
        />
        {opened.next && (
          <p>
            <button
              type="button"
              className="btn btn--sm"
              disabled={loading}
              onClick={() => void more()}
            >
              {loading ? "Loading…" : "Load older posts of this day"}
            </button>
          </p>
        )}
        {problem && (
          <p className="f-note" role="alert">
            {problem}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <QueryState
        isLoading={isLoading}
        isError={isError}
        retry={() => void refetch()}
        what="this period"
      />
      {data && (
        <ReplayView
          data={data}
          setPeriod={setPeriod}
          openDay={(day) => void openDay(day)}
          compare={compare}
          setCompare={setCompare}
        />
      )}
      {loading && <p className="f-note">Opening posts…</p>}
      {problem && (
        <p className="f-note" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
