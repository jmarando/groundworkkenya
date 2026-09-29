import { ActionButton } from "@/components/gw/briefing/parts";
import { DayPlan, StoryBlock } from "@/components/gw/briefing/Story";
import { SampleTag } from "@/components/gw/home/SectionHead";
import type { Scenario } from "@/lib/demo/types";
import type { TodayItem } from "@/lib/home";

/** What to do today, the day's story, and where to be. */
export function TodaySection({ s, items }: { s: Scenario; items: TodayItem[] }) {
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
        <SampleTag /> The story and the day&apos;s plan below are invented for a race like yours.
      </p>
      <div className="mb-grid">
        <StoryBlock s={s} />
        <aside className="mb-side" aria-label="Today's plan">
          <DayPlan s={s} />
        </aside>
      </div>
    </section>
  );
}
