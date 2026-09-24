import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  getTeam,
  ROLE_COPY,
  ROLES,
  setMemberRole,
  type Member,
  type Role,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team")({
  component: Team,
  head: () => ({
    meta: [
      { title: "Team · Groundwork" },
      {
        name: "description",
        content: "Who is on the campaign, what they can reach, and who is waiting to be let in.",
      },
    ],
  }),
});

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

function Team() {
  const fetchTeam = useServerFn(getTeam);
  const saveRole = useServerFn(setMemberRole);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["team"], queryFn: () => fetchTeam() });

  const change = useMutation({
    mutationFn: (input: { userId: string; role: Role }) => saveRole({ data: input }),
    onSuccess: async (_r, input) => {
      toast.success(
        input.role === "viewer" ? "Access removed." : `Now ${ROLE_COPY[input.role].name}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["team"] });
      await queryClient.invalidateQueries({ queryKey: ["my-access"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(null),
  });

  const set = (m: Member, role: Role) => {
    if (role === m.role) return;
    if (role === "viewer" && !window.confirm(`Remove ${m.name ?? m.email}'s access?`)) return;
    setBusy(m.userId);
    change.mutate({ userId: m.userId, role });
  };

  const header = (
    <div className="vh">
      <div>
        <span className="eyebrow">System · team</span>
        <h1>
          Who gets <span className="serif">in.</span>
        </h1>
        <p className="meta">
          Anyone can create an account. An account alone sees nothing: new sign-ups wait here until
          an admin gives them a role.
        </p>
      </div>
    </div>
  );

  if (!data) {
    return (
      <section className="view active" aria-label="Team">
        {header}
        <p className="meta">Loading the team…</p>
      </section>
    );
  }

  if (!data.canManage) {
    return (
      <section className="view active" aria-label="Team">
        {header}
        <div className="card">
          <p className="f-note">Only an admin can see and change who is on the team.</p>
        </div>
      </section>
    );
  }

  const waiting = data.members.filter((m) => m.role === "viewer");
  const admitted = data.members.filter((m) => m.role !== "viewer");

  return (
    <section className="view active" aria-label="Team">
      {header}

      <div className="card">
        <div className="card-head">
          <h2>Waiting to be let in</h2>
          <span className="eyebrow">{waiting.length}</span>
        </div>
        {waiting.length === 0 ? (
          <p className="f-note">Nobody is waiting.</p>
        ) : (
          <>
            <p className="f-note">
              They can sign in but see nothing. Admit the people you recognise; leave anyone you
              don't.
            </p>
            <ul className="team-list">
              {waiting.map((m) => (
                <li key={m.userId} className="team-row">
                  <div className="team-who">
                    <b>{m.name ?? "No name given"}</b>
                    <span className="mono">{m.email ?? "—"}</span>
                    <small>Signed up {day(m.joinedAt)}</small>
                  </div>
                  <select
                    className="team-select"
                    aria-label={`Admit ${m.name ?? m.email}`}
                    value=""
                    disabled={busy === m.userId}
                    onChange={(e) => set(m, e.target.value as Role)}
                  >
                    <option value="" disabled>
                      Admit as…
                    </option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_COPY[r].name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>On the campaign</h2>
          <span className="eyebrow">{admitted.length}</span>
        </div>
        <ul className="team-list">
          {admitted.map((m) => (
            <li key={m.userId} className="team-row">
              <div className="team-who">
                <b>
                  {m.name ?? "No name given"}
                  {m.isSelf && <span className="chip--self">you</span>}
                </b>
                <span className="mono">{m.email ?? "—"}</span>
                <small>{ROLE_COPY[m.role].blurb}</small>
              </div>
              <select
                className="team-select"
                aria-label={`Role for ${m.name ?? m.email}`}
                value={m.role}
                disabled={busy === m.userId}
                onChange={(e) => set(m, e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_COPY[r].name}
                  </option>
                ))}
                <option value="viewer">Remove access</option>
              </select>
            </li>
          ))}
        </ul>
        <p className="f-note">
          Finance is admin and manager only, enforced by the database rather than by hiding the menu
          item. Launching polls, which sends SMS, is too.
        </p>
      </div>
    </section>
  );
}
