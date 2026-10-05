import type { CanvassData } from "@/lib/console.functions";
import { doorIssues, inArea, walkNote, type Area, type WardInfo } from "@/lib/voters-view";

const nf = new Intl.NumberFormat("en-KE");
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "never";
const stampAt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The area's doors: coverage ward by ward, what came up, the latest doors and who's next. */
export function DoorsView({
  area,
  wards,
  canvass,
  onWard,
  onPerson,
}: {
  area: Area;
  wards: WardInfo[];
  canvass: CanvassData | null;
  onWard: (slug: string) => void;
  /** Opens a record; left out for agents, who don't see the People list. */
  onPerson?: (id: string) => void;
}) {
  if (!canvass) return <p className="meta">Reading the doors…</p>;
  const turf = canvass.wards.filter((w) => inArea(w.name, area, wards));
  const issues = doorIssues(canvass.wards, area, wards);
  const recent = canvass.recent.filter((r) => inArea(r.ward, area, wards)).slice(0, 8);
  const walk = canvass.walkList.filter((p) => inArea(p.ward, area, wards));
  const slugOf = (name: string) => wards.find((w) => w.name === name)?.slug;
  return (
    <>
      <div className="pgrid">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>Turf coverage</h2>
            <span className="mono">seen in the last 30 days</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Constituency</th>
                  <th style={{ textAlign: "right" }}>On file</th>
                  <th style={{ textAlign: "right" }}>Seen 30d</th>
                  <th style={{ textAlign: "right" }}>Covered</th>
                  <th style={{ textAlign: "right" }}>Doors 30d</th>
                </tr>
              </thead>
              <tbody>
                {turf.map((w) => {
                  const slug = slugOf(w.name);
                  return (
                    <tr key={w.id}>
                      <td>
                        {slug && area.level !== "ward" ? (
                          <button type="button" className="vt-link" onClick={() => onWard(slug)}>
                            {w.name}
                          </button>
                        ) : (
                          <b>{w.name}</b>
                        )}
                      </td>
                      <td className="meta">{w.constituency}</td>
                      <td className="num">{nf.format(w.people)}</td>
                      <td className="num">{nf.format(w.knocked)}</td>
                      <td className="num meta">
                        {w.people ? Math.round((w.knocked / w.people) * 100) : 0}%
                      </td>
                      <td className="num">{nf.format(w.doors30)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {turf.length === 0 ? <p className="f-note">No doors on record here yet.</p> : null}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Raised at the door</h2>
            <span className="mono">from conversations</span>
          </div>
          <div className="f-rows">
            {issues.map((i) => (
              <div className="f-row" key={i.name}>
                <span>{i.name}</span>
                <b>{nf.format(i.count)}</b>
              </div>
            ))}
            {issues.length === 0 ? <p className="meta">No issues logged here yet.</p> : null}
          </div>
          <div className="card-head" style={{ marginTop: 18 }}>
            <h2>Latest doors</h2>
          </div>
          <div className="f-rows">
            {recent.map((r) => (
              <div className="f-row" key={r.id}>
                <span>
                  {r.person} · {r.ward ?? "—"}
                </span>
                <b>
                  {r.outcome}
                  {r.issue ? ` · ${r.issue}` : ""} <span className="mono">{stampAt(r.at)}</span>
                </b>
              </div>
            ))}
            {recent.length === 0 ? <p className="meta">No doors knocked here yet.</p> : null}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Next walk list</h2>
          <span className="mono">{nf.format(walk.length)} doors</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Ward</th>
                <th>Group</th>
                <th style={{ textAlign: "right" }}>Support</th>
                <th>Last seen</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {walk.slice(0, 60).map((p) => (
                <tr key={p.id}>
                  <td>
                    {onPerson ? (
                      <button type="button" className="vt-link" onClick={() => onPerson(p.id)}>
                        {p.name}
                      </button>
                    ) : (
                      <b>{p.name}</b>
                    )}
                  </td>
                  <td className="mono">{p.phone}</td>
                  <td className="meta">{p.ward ?? "—"}</td>
                  <td className="meta">{p.segment ?? "—"}</td>
                  <td className="num">{p.support}</td>
                  <td className="meta">{day(p.lastTouch)}</td>
                  <td className="meta">{p.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {walk.length === 0 ? <p className="f-note">Nothing outstanding here.</p> : null}
        </div>
        {walkNote(walk.length) ? (
          <p className="f-note" style={{ marginTop: 10 }}>
            {walkNote(walk.length)}
          </p>
        ) : null}
      </div>
    </>
  );
}
