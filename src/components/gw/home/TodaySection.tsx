import { ActionButton } from "@/components/gw/briefing/parts";
import { StoryBlock } from "@/components/gw/briefing/Story";
import { DiaryPlan } from "@/components/gw/home/DiaryPlan";
import { SampleTag } from "@/components/gw/home/SectionHead";
import type { Scenario } from "@/lib/demo/types";
import type { DiaryEntry } from "@/lib/diary";
import type { TodayItem } from "@/lib/home";

/** What to do today, the day's story, and where to be. */
export function TodaySection({
  s,
  items,
  plan,
  watch,
  canEdit,
}: {
  s: Scenario;
  items: TodayItem[];
  /** Today's stops from the diary, and what to watch over the next three days. */
  plan: DiaryEntry[];
  watch: DiaryEntry[];
  canEdit: boolean;
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
      <p className="home-note">
        <SampleTag /> The story below is invented for a race like yours.
      </p>
      <div className="mb-grid">
        <StoryBlock s={s} />
        <aside className="mb-side" aria-label="Today's plan">
          <DiaryPlan plan={plan} watch={watch} canEdit={canEdit} />
        </aside>
      </div>
    </section>
  );
}
