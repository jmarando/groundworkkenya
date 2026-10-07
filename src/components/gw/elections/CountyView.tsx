import { AreaMap } from "@/components/gw/elections/AreaMap";
import { AreaNumbers } from "@/components/gw/elections/AreaNumbers";
import { ResultList } from "@/components/gw/elections/ResultList";
import { TODO_NAMES, type Race } from "@/lib/atlas";
import {
  RACE_NAMES,
  figuresFor,
  rankChildren,
  resultBlocks,
  shadeOf,
  share1,
  signedPoints,
  TODO_COLOURS,
  votes,
  whole,
  type AtlasArea,
  type AtlasData,
} from "@/lib/atlas-view";
import type { Shade } from "@/lib/elections-view";

const SHADE_NAMES: Record<Shade, string> = {
  todo: "what to do",
  lean: "lean",
  turnout: "turnout",
  swing: "swing",
};

/** A county (or Kenya): its result, its map, and its parts ranked by the votes within reach. */
export function CountyView({
  d,
  area,
  race,
  year,
  shade,
  canEdit,
  onArea,
  onSetup,
}: {
  d: AtlasData;
  area: AtlasArea;
  race: Race;
  year: number;
  shade: Shade;
  canEdit: boolean;
  onArea: (key: string) => void;
  onSetup: () => void;
}) {
  const own = figuresFor(d, area.key, race, year);
  const parts = rankChildren(d, area.key, race, year);
  const block = resultBlocks(d, area.key, [race]).find((b) => b.year === year) ?? null;
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const constituencyOf = (wardKey: string) => wardKey.split("/").slice(0, 2).join("/");
  const colourOf = (wardKey: string) => {
    const part = byKey.get(constituencyOf(wardKey));
    return part ? (shadeOf(part, shade)?.colour ?? null) : null;
  };
  const tags = [...new Set(parts.map((p) => p.tag).filter((t): t is string => Boolean(t)))];
  return (
    <>
      <AreaNumbers
        f={own}
        year={year}
        raceName={RACE_NAMES[race]}
        canSetSides={canEdit}
        onSetup={onSetup}
      />
      <div className="el-grid">
        <section className="card">
          <div className="card-head">
            <h2>
              {RACE_NAMES[race]}, {year}
            </h2>
          </div>
          {block ? (
            <ResultList block={block} />
          ) : (
            <p className="f-note">
              No {area.level === "country" ? "national" : "county"} {RACE_NAMES[race].toLowerCase()}{" "}
              result found for {year} yet.
            </p>
          )}
        </section>
        {area.level === "county" ? (
          <section className="card">
            <div className="card-head">
              <h2>By constituency</h2>
              <span className="mono">shaded by {SHADE_NAMES[shade]}</span>
            </div>
            <AreaMap
              county={area.key}
              focus={area.key}
              colourOf={colourOf}
              onPick={(wardKey) => onArea(constituencyOf(wardKey))}
              label={`${area.name} by constituency, shaded by ${SHADE_NAMES[shade]}`}
            />
            <p className="meta">Tap a constituency to open it.</p>
          </section>
        ) : null}
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Where votes can move</h2>
          <span className="mono">
            {parts.length} {area.level === "country" ? "counties" : "constituencies"}
          </span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{area.level === "country" ? "County" : "Constituency"}</th>
                <th>What to do</th>
                <th style={{ textAlign: "right" }}>Our share</th>
                <th style={{ textAlign: "right" }}>Turnout</th>
                <th style={{ textAlign: "right" }}>Swing</th>
                <th style={{ textAlign: "right" }}>Within reach</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.key}>
                  <td>
                    <button type="button" className="vt-link" onClick={() => onArea(p.key)}>
                      {p.name}
                    </button>
                  </td>
                  <td>
                    {p.todo ? (
                      <>
                        <span className="el-chip" style={{ background: TODO_COLOURS[p.todo.todo] }}>
                          {TODO_NAMES[p.todo.todo]}
                        </span>
                        <br />
                        <span className="meta">{p.todo.reason}</span>
                      </>
                    ) : (
                      <span className="meta">not found yet</span>
                    )}
                  </td>
                  <td className="num">
                    {p.ourShare === null ? "—" : share1(p.ourShare)}
                    {p.listedOnly ? "*" : ""}
                  </td>
                  <td className="num">{p.turnout === null ? "—" : whole(p.turnout)}</td>
                  <td className="num">{p.swing === null ? "—" : signedPoints(p.swing)}</td>
                  <td className="num">{p.reach ? votes(p.reach.total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {parts.some((p) => p.listedOnly) ? (
          <p className="f-note">
            * Share of the candidates listed: the report gave no total of valid votes.
          </p>
        ) : null}
        {tags.length ? <p className="el-src">{tags.join(" · ")}</p> : null}
      </section>
    </>
  );
}
