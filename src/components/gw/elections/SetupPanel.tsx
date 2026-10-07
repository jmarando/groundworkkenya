import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { Race } from "@/lib/atlas";
import { ATLAS_ELECTIONS } from "@/lib/atlas-files";
import { saveHome, saveSide } from "@/lib/atlas.functions";
import { RACE_NAMES, blocsIn, type AtlasData } from "@/lib/atlas-view";

type Job = { kind: "home"; area: string } | { kind: "side"; election: string; bloc: string | null };

const label = (election: string) =>
  `${election.slice(0, 4)} · ${RACE_NAMES[election.slice(5) as Race]}`;

/** The candidate's or manager's one-time setup: where Elections opens, and our side in each election. */
export function SetupPanel({
  d,
  home,
  onClose,
}: {
  d: AtlasData;
  home: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toHome = useServerFn(saveHome);
  const toSide = useServerFn(saveSide);
  const run = useMutation({
    mutationFn: (job: Job) =>
      job.kind === "home"
        ? toHome({ data: { area: job.area } })
        : toSide({ data: { election: job.election, bloc: job.bloc } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["atlas"] });
      toast.success("Saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const name = new Map(d.areas.map((a) => [a.key, a.name]));
  const places = d.areas.filter((a) => a.level !== "ward");
  const elections = [...ATLAS_ELECTIONS].reverse().filter((e) => blocsIn(d, e).length);
  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="el-setup-title">
      <div className="pb re-panel">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Elections · setup</span>
            <h2 id="el-setup-title">Your home area and sides</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <section className="card">
            <div className="card-head">
              <h2>Home area</h2>
            </div>
            <p className="meta">Where Elections opens: your constituency, your county or Kenya.</p>
            <select
              value={home}
              onChange={(e) => run.mutate({ kind: "home", area: e.target.value })}
              aria-label="Home area"
            >
              {places.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                  {a.level === "constituency" && a.parent ? `, ${name.get(a.parent) ?? ""}` : ""}
                </option>
              ))}
            </select>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Our side in each election</h2>
            </div>
            <p className="meta">
              Which bloc counts as yours in each past election. Politics has moved since, so you
              decide; lean, swing and what to do need it.
            </p>
            <div className="f-rows">
              {elections.map((e) => (
                <div className="f-row" key={e}>
                  <span>{label(e)}</span>
                  <select
                    value={d.sides[e] ?? ""}
                    onChange={(ev) =>
                      run.mutate({ kind: "side", election: e, bloc: ev.target.value || null })
                    }
                    aria-label={`Our side, ${label(e)}`}
                  >
                    <option value="">Not set</option>
                    {blocsIn(d, e).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
