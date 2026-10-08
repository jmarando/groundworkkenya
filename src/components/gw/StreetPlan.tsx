import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { listStreets, saveStreet, type Street } from "@/lib/streets.functions";

/** Organisers split a ward into streets and give each street to an agent. */
export function StreetPlan({ wards }: { wards: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const fetchStreets = useServerFn(listStreets);
  const [wardId, setWardId] = useState("");
  const [newName, setNewName] = useState("");
  const save = useServerFn(saveStreet);

  const { data: streets, isFetching } = useQuery({
    queryKey: ["walk-list", "streets", wardId],
    queryFn: () => fetchStreets({ data: { wardId } }),
    enabled: Boolean(wardId),
  });

  const run = async (input: Parameters<typeof save>[0]["data"], ok: string) => {
    try {
      await save({ data: input });
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["walk-list"] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
      return false;
    }
  };

  return (
    <div className="sp">
      <label className="pb-field">
        <span>Ward</span>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          <option value="">Choose a ward to plan</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>

      {!wardId && (
        <p className="f-note">
          Each street becomes a walk list. Give it to an agent and they see it on their phone.
        </p>
      )}
      {wardId && !streets && isFetching && <p className="f-note">Loading streets…</p>}

      {streets && (
        <ul className="sp-list">
          {streets.map((s) => (
            <StreetRow key={s.id} street={s} onSave={run} />
          ))}
          {streets.length === 0 && <li className="f-note">No streets yet. Add the first one.</li>}
        </ul>
      )}

      {wardId && (
        <form
          className="sp-add"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ wardId, name: newName }, `${newName.trim()} added.`)) setNewName("");
          }}
        >
          <input
            value={newName}
            placeholder="New street, e.g. Jogoo Road"
            aria-label="New street name"
            maxLength={120}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn btn--primary btn--sm" type="submit" disabled={!newName.trim()}>
            Add street
          </button>
        </form>
      )}
    </div>
  );
}

function StreetRow({
  street,
  onSave,
}: {
  street: Street;
  onSave: (
    i: { id: string; wardId: string; name: string; agentName: string; agentPhone: string },
    ok: string,
  ) => Promise<boolean>;
}) {
  const [agent, setAgent] = useState(street.agentName ?? "");
  const [phone, setPhone] = useState(street.agentPhone ?? "");
  const dirty = agent !== (street.agentName ?? "") || phone !== (street.agentPhone ?? "");
  const pct = street.doors ? Math.round((street.done / street.doors) * 100) : 0;
  return (
    <li className="sp-row">
      <div className="sp-head">
        <b>{street.name}</b>
        <span className="mono">
          {street.done}/{street.doors} doors this week
        </span>
      </div>
      <span className="cov-bar">
        <i style={{ width: `${pct}%` }} />
      </span>
      <div className="sp-assign">
        <input
          value={agent}
          placeholder="Agent name"
          aria-label={`Agent for ${street.name}`}
          onChange={(e) => setAgent(e.target.value)}
        />
        <input
          value={phone}
          inputMode="tel"
          placeholder="Agent phone"
          aria-label={`Agent phone for ${street.name}`}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          disabled={!dirty}
          onClick={() =>
            void onSave(
              { id: street.id, wardId: street.wardId, name: street.name, agentName: agent, agentPhone: phone },
              agent.trim() ? `${street.name} given to ${agent.trim()}.` : `${street.name} unassigned.`,
            )
          }
        >
          Assign
        </button>
      </div>
    </li>
  );
}
