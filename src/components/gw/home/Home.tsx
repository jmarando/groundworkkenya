import { useState } from "react";

import { CampaignSection } from "@/components/gw/home/CampaignSection";
import { HomeHeader } from "@/components/gw/home/HomeHeader";
import { AddPoll, EditRivals, useRemovePoll } from "@/components/gw/home/RaceEditor";
import { RaceSection } from "@/components/gw/home/RaceSection";
import { StoryEditor } from "@/components/gw/home/StoryEditor";
import { TodaySection } from "@/components/gw/home/TodaySection";
import { nairobiToday } from "@/lib/demo/insights";
import type { Scenario } from "@/lib/demo/types";
import { dayPlan, nairobiTime, nextStop, watchList } from "@/lib/diary";
import {
  greetingName,
  nextStopItem,
  raceVerdict,
  realToday,
  sectionModes,
  todayItems,
} from "@/lib/home";
import type { HomeData } from "@/lib/home.functions";
import { realVerdict } from "@/lib/race-data";

const NOTHING_YET: HomeData = {
  firstName: null,
  facts: { realPeople: 0, rivals: 0, polls: 0 },
  signals: { pendingExpenses: 0, unread: 0, mind: null },
  race: { rivals: [], polls: [], posts: [] },
  diary: [],
  story: null,
  mind: { lines: [], sizes: { news: 0, messages: 0, door: 0, searches: 0 } },
  search: null,
};

/**
 * The campaign's morning, top to bottom: what to do today, where the race
 * stands, and whether the campaign's own work is on course. Each section says
 * whether it is real or a sample of a race like this one. `canEdit`: the
 * candidate or manager, who can change the race.
 */
export function Home({
  s,
  data,
  canEdit = false,
}: {
  s: Scenario;
  data?: HomeData;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState<null | "rivals" | "poll" | "story">(null);
  const removePollNow = useRemovePoll();
  const today = nairobiToday();
  const d = data ?? NOTHING_YET;
  const modes = sectionModes(d.facts);
  const now = nairobiTime();
  const next = nextStop(d.diary, today, now);
  const items = todayItems(
    [...(next ? [nextStopItem(next)] : []), ...realToday(d.signals)],
    s.today,
  );
  const verdict = modes.race === "real" ? realVerdict(d.race.rivals, d.race.polls) : raceVerdict(s);
  return (
    <div className="mb ov home">
      <HomeHeader
        s={s}
        today={today}
        name={greetingName(d.firstName, s.candidate.first)}
        verdict={verdict}
        raceMode={modes.race}
        items={items}
      />
      <TodaySection
        items={items}
        loading={!data}
        story={d.story}
        time={now}
        plan={dayPlan(d.diary, today)}
        watch={watchList(d.diary, today)}
        canEdit={canEdit}
        onEditStory={() => setEditing("story")}
      />
      {editing === "story" && <StoryEditor view={d.story} onClose={() => setEditing(null)} />}
      <RaceSection
        s={s}
        mode={modes.race}
        race={d.race}
        mind={d.mind}
        search={d.search}
        canEdit={canEdit}
        onEdit={setEditing}
        onRemovePoll={removePollNow}
      />
      {editing === "rivals" && (
        <EditRivals rivals={d.race.rivals} onClose={() => setEditing(null)} />
      )}
      {editing === "poll" && <AddPoll rivals={d.race.rivals} onClose={() => setEditing(null)} />}
      <CampaignSection s={s} today={today} mode={modes.campaign} />
      <p className="mb-foot">
        Sections marked Sample show invented figures for a race like yours
        {s.candidate.fictional ? ", with a fictional candidate" : ""}. Results marked IEBC are real.
      </p>
    </div>
  );
}
