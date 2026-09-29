import { CampaignSection } from "@/components/gw/home/CampaignSection";
import { HomeHeader } from "@/components/gw/home/HomeHeader";
import { RaceSection } from "@/components/gw/home/RaceSection";
import { TodaySection } from "@/components/gw/home/TodaySection";
import { nairobiToday } from "@/lib/demo/insights";
import type { Scenario } from "@/lib/demo/types";
import { greetingName, raceVerdict, realToday, sectionModes, todayItems } from "@/lib/home";
import type { HomeData } from "@/lib/home.functions";

const NOTHING_YET: HomeData = {
  firstName: null,
  facts: { realPeople: 0, rivals: 0, polls: 0 },
  signals: { pendingExpenses: 0, unread: 0, topIssue: null },
};

/**
 * The campaign's morning, top to bottom: what to do today, where the race
 * stands, and whether the campaign's own work is on course. Each section says
 * whether it is real or a sample of a race like this one.
 */
export function Home({ s, data }: { s: Scenario; data?: HomeData }) {
  const today = nairobiToday();
  const d = data ?? NOTHING_YET;
  const modes = sectionModes(d.facts);
  return (
    <div className="mb ov home">
      <HomeHeader
        s={s}
        today={today}
        name={greetingName(d.firstName, s.candidate.first)}
        verdict={raceVerdict(s)}
        raceMode={modes.race}
      />
      <TodaySection s={s} items={todayItems(realToday(d.signals), s.today)} />
      <RaceSection s={s} mode={modes.race} />
      <CampaignSection s={s} today={today} mode={modes.campaign} />
      <p className="mb-foot">
        Sections marked Sample show invented figures for a race like yours
        {s.candidate.fictional ? ", with a fictional candidate" : ""}. Results marked IEBC are real.
      </p>
    </div>
  );
}
