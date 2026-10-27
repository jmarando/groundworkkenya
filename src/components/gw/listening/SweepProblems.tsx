// One calm note when sweeping has stopped or a service can't be read: what is wrong, what to do,
// and the service's own words kept one tap away. src/lib/listening-health.ts words the problems.
import type { Problem } from "@/lib/listening-health";

export function SweepProblems({
  problems,
  canRestart,
  busy,
  restart,
}: {
  problems: Problem[];
  canRestart: boolean;
  busy: boolean;
  restart: () => void;
}) {
  if (problems.length === 0) return null;
  return (
    <div className="card lsn-problems" role="status">
      {problems.map((p) => (
        <div key={p.key} className="lsn-problem">
          <div>
            <h2>{p.title}</h2>
            <p>
              {p.why} {p.fix}
            </p>
            {p.restart && !canRestart ? (
              <p className="f-note">
                Sweeping runs for every campaign, so only Groundwork can restart it. Let your
                Groundwork contact know.
              </p>
            ) : null}
            {p.detail ? (
              <details className="lsn-detail">
                <summary>What the service said</summary>
                <p className="mono">{p.detail}</p>
              </details>
            ) : null}
          </div>
          {p.restart && canRestart ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy}
              onClick={restart}
            >
              Restart
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
