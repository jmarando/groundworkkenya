import { AreaMap } from "@/components/gw/elections/AreaMap";
import { AreaNumbers } from "@/components/gw/elections/AreaNumbers";
import { NoteBox } from "@/components/gw/elections/NoteBox";
import { PeopleCard } from "@/components/gw/elections/PeopleCard";
import { ResultList } from "@/components/gw/elections/ResultList";
import { RACES, type Race } from "@/lib/atlas";
import {
  RACE_NAMES,
  figuresFor,
  resultBlocks,
  votes,
  whole,
  type AtlasArea,
  type AtlasData,
} from "@/lib/atlas-view";

const FOCUS = "hsl(158 40% 40%)";

/** A constituency: its numbers, every result found here, who lives here, its wards and the team's note. */
export function ConstituencyView({
  d,
  area,
  race,
  year,
  canEdit,
  onArea,
  onSetup,
}: {
  d: AtlasData;
  area: AtlasArea;
  race: Race;
  year: number;
  canEdit: boolean;
  onArea: (key: string) => void;
  onSetup: () => void;
}) {
  const f = figuresFor(d, area.key, race, year);
  const blocks = resultBlocks(d, area.key, [race, ...RACES.filter((r) => r !== race)]);
  const wards = d.areas
    .filter((a) => a.parent === area.key)
    .map((w) => figuresFor(d, w.key, race, year));
  const missing = RACES.filter((r) => !blocks.some((b) => b.race === r)).map((r) => RACE_NAMES[r]);
  return (
    <>
      <AreaNumbers
        f={f}
        year={year}
        raceName={RACE_NAMES[race]}
        canSetSides={canEdit}
        onSetup={onSetup}
      />
      <div className="el-grid">
        <section className="card">
          <div className="card-head">
            <h2>Results here</h2>
          </div>
          {blocks.map((b) => (
            <ResultList key={`${b.race}-${b.year}`} block={b} />
          ))}
          {missing.length ? (
            <p className="f-note">
              Not found yet for {area.name}: {missing.join(", ")}.
            </p>
          ) : null}
        </section>
        <div className="el-side">
          <PeopleCard f={f} />
          {area.parent ? (
            <section className="card">
              <AreaMap
                county={area.parent}
                focus={area.key}
                colourOf={(k) => (k.startsWith(`${area.key}/`) ? FOCUS : null)}
                onPick={(k) =>
                  onArea(k.startsWith(`${area.key}/`) ? k : k.split("/").slice(0, 2).join("/"))
                }
                label={`${area.name}'s wards`}
              />
            </section>
          ) : null}
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Its wards</h2>
          <span className="mono">{wards.length} wards</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ward</th>
                <th style={{ textAlign: "right" }}>Registered 2022</th>
                <th style={{ textAlign: "right" }}>Adults (estimate)</th>
                <th style={{ textAlign: "right" }}>Aged 18–34</th>
                <th style={{ textAlign: "right" }}>Not registered (estimate)</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {wards.map((w) => (
                <tr key={w.key}>
                  <td>
                    <button type="button" className="vt-link" onClick={() => onArea(w.key)}>
                      {w.name}
                    </button>
                  </td>
                  <td className="num">{w.registered === null ? "—" : votes(w.registered)}</td>
                  <td className="num">{w.population ? votes(w.population.adults) : "—"}</td>
                  <td className="num">
                    {w.population && w.population.adults
                      ? whole(w.population.youngAdults / w.population.adults)
                      : "—"}
                  </td>
                  <td className="num">
                    {w.notRegistered
                      ? votes(w.notRegistered.adults)
                      : w.estimateBelowRegister
                        ? "below the register"
                        : "—"}
                  </td>
                  <td className="meta">{d.notes[w.key] ? "yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <NoteBox
        area={area.key}
        name={area.name}
        note={d.notes[area.key] ?? null}
        canEdit={canEdit}
      />
    </>
  );
}
