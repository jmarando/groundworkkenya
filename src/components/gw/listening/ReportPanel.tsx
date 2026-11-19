// The data side of the Report: reads the last 7, 30 or 90 Nairobi days, and opens the posts behind
// any figure (read by id, newest first, as many as Listening reads at once). The screen is
// Report.tsx.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Drill, type React } from "@/components/gw/listening/Overview";
import { ReportView } from "@/components/gw/listening/Report";
import { QueryState } from "@/components/gw/QueryState";
import { nf } from "@/lib/format";
import { getListeningPosts } from "@/lib/listening-history.functions";
import { getListeningReport } from "@/lib/listening-report.functions";
import type { Mention } from "@/lib/listening.functions";
import { addDays, nairobiToday } from "@/lib/nairobi-date";

type Mark = (ids: string[], status: "new" | "actioned") => void;
type Opened = { label: string; posts: Mention[]; total: number };

export function ReportPanel({ busy, mark, react }: { busy: boolean; mark: Mark; react?: React }) {
  const fetchReport = useServerFn(getListeningReport);
  const fetchPosts = useServerFn(getListeningPosts);
  const [span, setSpan] = useState(30);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const to = nairobiToday();
  const from = addDays(to, -(span - 1));
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["listening-report", from, to],
    queryFn: () => fetchReport({ data: { from, to } }),
  });

  const open = async (label: string, ids: string[], total: number) => {
    if (!ids.length) return;
    setProblem(null);
    setLoading(true);
    try {
      const page = await fetchPosts({ data: { ids } });
      setOpened({ label, posts: page.posts, total });
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
          focus={{ label: opened.label }}
          posts={opened.posts}
          back={() => setOpened(null)}
          backLabel="← Report"
          busy={busy}
          mark={markHere}
          react={react}
        />
        {opened.total > opened.posts.length && (
          <p className="f-note">
            Showing the newest {nf.format(opened.posts.length)} of {nf.format(opened.total)}.
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
        what="the report"
      />
      {data && (
        <ReportView
          data={data}
          span={span}
          setSpan={setSpan}
          open={(label, ids, total) => void open(label, ids, total)}
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
