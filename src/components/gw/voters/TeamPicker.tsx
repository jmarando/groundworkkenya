// Choosing who a walk list goes to: the team, agents first, each with the doors still open on
// their lists.

import { teamOptionText } from "@/lib/walk-lists";
import type { TeamMember } from "@/lib/walk-lists.functions";

export function TeamPicker({
  label,
  value,
  onChange,
  team,
  none,
}: {
  label: string;
  value: string;
  onChange: (userId: string) => void;
  /** Undefined while the team is read, null when it can't be. */
  team: TeamMember[] | null | undefined;
  /** The words for no one yet (a draft); left out when someone must be chosen. */
  none?: string;
}) {
  return (
    <label className="pb-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!team}>
        {none ? (
          <option value="">{none}</option>
        ) : (
          <option value="" disabled>
            Choose someone
          </option>
        )}
        {(team ?? []).map((m) => (
          <option key={m.userId} value={m.userId}>
            {teamOptionText(m)}
          </option>
        ))}
      </select>
      {team === undefined ? <small className="meta">Reading the team…</small> : null}
      {team === null ? <small className="meta">Could not read the team. Try again.</small> : null}
    </label>
  );
}
