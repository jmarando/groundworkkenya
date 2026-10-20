import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { CampaignSection } from "@/components/gw/home/CampaignSection";
import { FindingsBlock } from "@/components/gw/home/FindingsBlock";
import { HomeHeader } from "@/components/gw/home/HomeHeader";
import { AddPoll, EditRivals, useRemovePoll } from "@/components/gw/home/RaceEditor";
import { RaceSection } from "@/components/gw/home/RaceSection";
import { StoryEditor } from "@/components/gw/home/StoryEditor";
import { StrategyBlock } from "@/components/gw/home/StrategyBlock";
import { TodaySection } from "@/components/gw/home/TodaySection";
import { nairobiToday } from "@/lib/nairobi-date";
import type { Scenario } from "@/lib/demo/types";
import { dayPlan, nairobiTime, nextStop, watchList } from "@/lib/diary";
import { greetingName, nextStopItem, realToday, sectionModes, todayItems } from "@/lib/home";
import type { HomeData } from "@/lib/home.functions";
import { spokenHome } from "@/lib/home-spoken";
import { getHomeStrategy } from "@/lib/home-strategy.functions";
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
 * stands, and whether the campaign's own work is on course. Everything is the
 * campaign's own; a section with nothing yet says what fills it. `canEdit`:
 * the candidate or manager, who can change the race, the story and the diary.
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
  const fetchStrategy = useServerFn(getHomeStrategy);
  // The same read StrategyBlock shows; shared through the query cache, so it is fetched once.
  const { data: sg } = useQuery({
    queryKey: ["home-strategy"],
    queryFn: () => fetchStrategy(),
    retry: false,
    enabled: Boolean(data),
  });
  const today = nairobiToday();
  const d = data ?? NOTHING_YET;
  const modes = sectionModes(d.facts);
  const now = nairobiTime();
  const next = nextStop(d.diary, today, now);
  const items = todayItems([...(next ? [nextStopItem(next)] : []), ...realToday(d.signals)]);
  const verdict = modes.race === "real" ? realVerdict(d.race.rivals, d.race.polls) : "";
  const plan = dayPlan(d.diary, today);
  const name = greetingName(d.firstName, s.candidate.first);
  const script = spokenHome({
    name,
    today,
    verdict,
    items,
    story: d.story,
    plan,
    mind: d.signals.mind,
    strategy: sg
      ? {
          headline: sg.brief?.headline ?? null,
          next: sg.next ? { title: sg.next.title, on: sg.next.on } : null,
          wider: sg.impacts[0]
            ? {
                title: sg.impacts[0].title,
                stance: sg.impacts[0].stance,
                move: sg.impacts[0].moves[0] ?? null,
              }
            : null,
        }
      : null,
  });
  return (
    <div className="mb ov home">
      <HomeHeader s={s} today={today} name={name} verdict={verdict} script={script} />
      <TodaySection
        items={items}
        loading={!data}
        story={d.story}
        today={today}
        time={now}
        plan={plan}
        watch={watchList(d.diary, today)}
        upcoming={d.diary.filter((entry) => entry.day > today && entry.kind !== "watch")}
        canEdit={canEdit}
        onEditStory={() => setEditing("story")}
      />
      {data && <StrategyBlock />}
      <FindingsBlock today={items.map((t) => t.title)} />
      {editing === "story" && (
        <StoryEditor
          view={d.story?.day === today ? d.story : null}
          onClose={() => setEditing(null)}
        />
      )}
      <RaceSection
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
      <CampaignSection mode={modes.campaign} />
    </div>
  );
}
