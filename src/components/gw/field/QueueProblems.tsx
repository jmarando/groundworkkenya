// The visits the server refused: kept aside with their reasons so the others still send, each with
// a way to send it again or let it go. Shown wherever visits are saved.

import type { Queued } from "@/lib/field";

export function QueueProblems({
  problems,
  onRetry,
  onDiscard,
}: {
  problems: Queued[];
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}) {
  if (problems.length === 0) return null;
  return (
    <div className="fa-problems" role="alert">
      <b>Not saved — check these:</b>
      <ul>
        {problems.map((p) => (
          <li key={p.clientId}>
            <span>
              {p.label}: {p.problem}
            </span>
            <span className="fa-problem-actions">
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => onRetry(p.clientId)}
              >
                Try again
              </button>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => onDiscard(p.clientId)}
              >
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
