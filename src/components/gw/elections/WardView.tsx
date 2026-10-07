import { AreaMap } from "@/components/gw/elections/AreaMap";
import { NoteBox } from "@/components/gw/elections/NoteBox";
import { PeopleCard } from "@/components/gw/elections/PeopleCard";
import { ResultList } from "@/components/gw/elections/ResultList";
import type { Race } from "@/lib/atlas";
import {
  RACE_NAMES,
  figuresFor,
  resultBlocks,
  type AtlasArea,
  type AtlasData,
} from "@/lib/atlas-view";

/** A ward: who lives here, its constituency's result (labelled as such), and the team's note. */
export function WardView({
  d,
  area,
  race,
  year,
  canEdit,
}: {
  d: AtlasData;
  area: AtlasArea;
  race: Race;
  year: number;
  canEdit: boolean;
}) {
  const f = figuresFor(d, area.key, race, year);
  const parent = d.areas.find((a) => a.key === area.parent);
  const blocks = parent ? resultBlocks(d, parent.key, [race]) : [];
  const county = area.key.split("/")[0] ?? "";
  return (
    <>
      <div className="el-grid">
        <PeopleCard f={f} />
        <section className="card">
          <div className="card-head">
            <h2>
              {parent?.name ?? "Its constituency"}: {RACE_NAMES[race]}
            </h2>
            <span className="mono">constituency figure</span>
          </div>
          {blocks.map((b) => (
            <ResultList key={b.year} block={b} caption="constituency figure" />
          ))}
          {blocks.length ? null : (
            <p className="f-note">
              No {RACE_NAMES[race].toLowerCase()} result found for{" "}
              {parent?.name ?? "its constituency"} yet.
            </p>
          )}
          <p className="meta">Results for the ward itself come with the station data.</p>
        </section>
      </div>
      <section className="card">
        <AreaMap
          county={county}
          focus={area.key}
          colourOf={(k) => (k === area.key ? "hsl(158 40% 40%)" : null)}
          label={`${area.name} ward`}
        />
      </section>
      <NoteBox
        area={area.key}
        name={`${area.name} ward`}
        note={d.notes[area.key] ?? null}
        canEdit={canEdit}
      />
    </>
  );
}
