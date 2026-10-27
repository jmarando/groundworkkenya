import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, CalendarDays, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBriefingArchive } from "@/lib/briefing-archive.functions";
import { dayName, KIND_NAMES } from "@/lib/diary";
import { nairobiToday } from "@/lib/nairobi-date";
import { MorningNews, MorningStoryBlock } from "@/components/gw/home/MorningStoryBlock";
import { useAccess } from "@/hooks/useAccess";
import { useState } from "react";

const archiveOptions = (month: string) =>
  queryOptions({
    queryKey: ["briefing-archive", month],
    queryFn: () => getBriefingArchive({ data: { month } }),
    staleTime: 0,
  });
export const Route = createFileRoute("/_authenticated/archive")({
  validateSearch: (s: Record<string, unknown>) => ({
    month:
      typeof s["month"] === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s["month"])
        ? s["month"]
        : nairobiToday().slice(0, 7),
  }),
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(archiveOptions(deps.month)),
  head: () => ({
    meta: [
      { title: "Morning news & calendar archive · Groundwork" },
      {
        name: "description",
        content: "Read your campaign’s saved daily briefings, sources and calendar by month.",
      },
      { property: "og:title", content: "Morning news & calendar archive · Groundwork" },
      {
        property: "og:description",
        content: "Your campaign’s saved morning news and calendar, in one dated record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchivePage,
});
function ArchivePage() {
  const { month } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(archiveOptions(month));
  const { campaign } = useAccess();
  const [tab, setTab] = useState<"news" | "diary">("news");
  return (
    <section className="view active briefing-archive" aria-label="News and calendar archive">
      <header className="archive-head">
        <div>
          <span className="eyebrow">{campaign?.name}</span>
          <h1>
            <Archive size={25} /> News & calendar archive
          </h1>
        </div>
        <label className="archive-month">
          Month
          <input
            aria-label="Archive month"
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) navigate({ search: { month: e.target.value } });
            }}
          />
        </label>
      </header>
      <nav className="archive-tabs" aria-label="Archive views">
        <Button variant={tab === "news" ? "default" : "outline"} onClick={() => setTab("news")}>
          <Newspaper /> Morning news <span>{data.stories.length}</span>
        </Button>
        <Button variant={tab === "diary" ? "default" : "outline"} onClick={() => setTab("diary")}>
          <CalendarDays /> Calendar <span>{data.diary.length}</span>
        </Button>
      </nav>
      {tab === "news" ? (
        data.stories.length ? (
          data.stories.map((s) => (
            <details className="archive-entry" key={s.day}>
              <summary>
                <time dateTime={s.day}>{dayName(s.day)}</time>
                <strong>
                  {s.story.headline ??
                    (s.story.from ? "Morning headlines" : "Morning check · no fresh sources")}
                </strong>
                <span className="dim">{s.writtenBy === "team" ? "Team" : "Groundwork"}</span>
              </summary>
              <div className="archive-story">
                <MorningStoryBlock
                  view={s}
                  loading={false}
                  time="12:00"
                  canEdit={false}
                  onEdit={() => {}}
                />
                <MorningNews view={s} />
              </div>
            </details>
          ))
        ) : (
          <p className="archive-empty">No saved morning briefings this month.</p>
        )
      ) : data.diary.length ? (
        data.diary.map((e) => (
          <article className="archive-diary" key={e.id}>
            <time dateTime={e.day}>
              {dayName(e.day)} · {e.startsAt ?? "All day"}
            </time>
            <div>
              <h2>{e.title}</h2>
              <p className="meta">
                {KIND_NAMES[e.kind]}
                {e.wardName ? ` · ${e.wardName}` : ""}
              </p>
              {e.note && <p>{e.note}</p>}
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/diary" search={{ week: e.day }}>
                Open week
              </Link>
            </Button>
          </article>
        ))
      ) : (
        <p className="archive-empty">Nothing in the calendar this month.</p>
      )}
    </section>
  );
}
