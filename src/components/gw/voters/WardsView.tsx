import type { DoorWard, WardInfo } from "@/lib/voters-view";

const nf = new Intl.NumberFormat("en-KE");

/** Every ward in the area by the numbers; picking one goes into it. */
export function WardsView({
  wards,
  doors,
  onWard,
}: {
  wards: WardInfo[];
  doors: DoorWard[];
  onWard: (slug: string) => void;
}) {
  const doorsOf = new Map(doors.map((d) => [d.id, d]));
  const sorted = [...wards].sort((a, b) => b.registered - a.registered);
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h2>Every ward, by the numbers</h2>
          <p className="meta">
            Registered voters, the number you need, and how far the campaign has got.
          </p>
        </div>
        <span className="mono">{wards.length} wards</span>
      </div>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Ward</th>
              <th>Constituency</th>
              <th style={{ textAlign: "right" }}>Registered</th>
              <th style={{ textAlign: "right" }}>Target</th>
              <th style={{ textAlign: "right" }}>Supporters</th>
              <th>Progress</th>
              <th style={{ textAlign: "right" }}>Contacted 7d</th>
              <th style={{ textAlign: "right" }}>Doors 30d</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w) => (
              <tr key={w.id}>
                <td>
                  <button type="button" className="vt-link" onClick={() => onWard(w.slug)}>
                    {w.name}
                  </button>
                </td>
                <td className="meta">{w.constituency}</td>
                <td className="num">{nf.format(w.registered)}</td>
                <td className="num">{nf.format(w.target)}</td>
                <td className="num">{nf.format(w.supporters)}</td>
                <td style={{ minWidth: 120 }}>
                  <span className="cov-bar">
                    <i
                      style={{
                        width: `${w.target ? Math.min((w.supporters / w.target) * 100, 100) : 0}%`,
                      }}
                    />
                  </span>
                </td>
                <td className="num">{nf.format(w.contacted)}</td>
                <td className="num">{nf.format(doorsOf.get(w.id)?.doors30 ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
