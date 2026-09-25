import { Masthead, TodayThree } from "@/components/gw/briefing/Masthead";
import { OpponentWatch, Voters } from "@/components/gw/briefing/People";
import { LastTime, Polls } from "@/components/gw/briefing/Polls";
import { Race } from "@/components/gw/briefing/Race";
import { DayPlan, StoryBlock } from "@/components/gw/briefing/Story";
import { nairobiToday } from "@/lib/demo/insights";
import type { Scenario, ScenarioKey } from "@/lib/demo/types";

/**
 * The candidate's morning read, top to bottom: what to do today, the story
 * that matters, where they stand, rivals, voters, polls and history.
 */
export function MorningBriefing({
  s,
  onPick,
}: {
  s: Scenario;
  onPick: (key: ScenarioKey) => void;
}) {
  const today = nairobiToday();
  return (
    <div className="mb">
      <Masthead s={s} today={today} onPick={onPick} />
      <TodayThree s={s} />
      <div className="mb-grid">
        <StoryBlock s={s} />
        <aside className="mb-side" aria-label="Today's plan">
          <DayPlan s={s} />
        </aside>
      </div>
      <Race s={s} />
      <div className="mb-two">
        <OpponentWatch s={s} />
        <Voters s={s} />
      </div>
      <div className="mb-two">
        <Polls s={s} />
        <LastTime s={s} />
      </div>
      <p className="mb-foot">
        A demo briefing.{" "}
        {s.candidate.fictional
          ? "The candidate is fictional"
          : `${s.candidate.name} is a real candidate`}
        , rivals are placeholders, and every figure is invented except results marked IEBC. A live
        briefing is written each morning from the campaign's own data and the news.
      </p>
    </div>
  );
}
