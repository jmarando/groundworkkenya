import { ActionButton } from "@/components/gw/briefing/parts";
import { DiaryPlan } from "@/components/gw/home/DiaryPlan";
import { MorningStoryBlock } from "@/components/gw/home/MorningStoryBlock";
import { SampleTag } from "@/components/gw/home/SectionHead";
import type { DiaryEntry } from "@/lib/diary";
import type { TodayItem } from "@/lib/home";
import type { StoryView } from "@/lib/morning-story";

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
  return (
    <section className="home-sec" aria-labelledby="home-today">
      <div className="mb-three">
        <h2 id="home-today" className="mb-three-h">
          Today, in order
        </h2>
        <ol>
          {items.map((t) => (
            <li key={t.title}>
              <h3>
                {t.title} {t.sample ? <SampleTag /> : null}
              </h3>
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
    </section>
  );
}
