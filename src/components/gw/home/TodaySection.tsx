import { ActionButton } from "@/components/gw/briefing/parts";
import { DiaryPlan } from "@/components/gw/home/DiaryPlan";
import { MorningNews, MorningStoryBlock } from "@/components/gw/home/MorningStoryBlock";
import type { DiaryEntry } from "@/lib/diary";
import type { TodayItem } from "@/lib/home";
import type { StoryView } from "@/lib/morning-story";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Archive, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { catchUpMorning } from "@/lib/briefing-archive.functions";

/** What to do today, the day's story, and where to be. */
export function TodaySection({
  items,
  loading,
  story,
  time,
  plan,
  watch,
  canEdit,
  onEditStory,
}: {
  items: TodayItem[];
  /** Home's data is still on its way. */
  loading: boolean;
  /** This morning's story, or null before it is written or on a morning with no news. */
  story: StoryView | null;
  /** Nairobi's time now, HH:MM. */
  time: string;
  /** Today's stops from the diary, and what to watch over the next three days. */
  plan: DiaryEntry[];
  watch: DiaryEntry[];
  canEdit: boolean;
  onEditStory: () => void;
}) {
  const checkMorning = useServerFn(catchUpMorning);
  const queryClient = useQueryClient();
  const catchUp = useMutation({ mutationFn: () => checkMorning(), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["home"] }) });
  return (
    <section className="home-sec" aria-labelledby="home-today">
      <div className="morning-tools">
        <Button variant="ghost" size="sm" asChild><Link to="/archive" search={{ month: new Date().toISOString().slice(0, 7) }}><Archive /> News & diary archive</Link></Button>
        {canEdit && !story && <Button variant="outline" size="sm" disabled={catchUp.isPending} onClick={() => catchUp.mutate()}><RefreshCw /> {catchUp.isPending ? "Checking…" : "Check morning run"}</Button>}
        {catchUp.isError && <p role="alert">{catchUp.error.message}</p>}
      </div>
      <div className="mb-three">
        <h2 id="home-today" className="mb-three-h">
          Today, in order
        </h2>
        <ol>
          {items.map((t) => (
            <li key={t.title}>
              <h3>{t.title}</h3>
              <p>{t.detail}</p>
              <ActionButton action={t.action} />
            </li>
          ))}
        </ol>
      </div>
      <div className="mb-grid">
        <MorningStoryBlock
          view={story}
          loading={loading}
          time={time}
          canEdit={canEdit}
          onEdit={onEditStory}
        />
        <aside className="mb-side" aria-label="Today's plan">
          <DiaryPlan plan={plan} watch={watch} loading={loading} canEdit={canEdit} />
        </aside>
      </div>
      <MorningNews view={story} />
    </section>
  );
}
