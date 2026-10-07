import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  getTeam,
  inviteMember,
  removeMember,
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
      { property: "og:title", content: "Team · Groundwork" },
      { property: "og:description", content: "Who is on the campaign, what they can reach, and who is waiting to be let in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const remove = useServerFn(removeMember);
  const invite = useServerFn(inviteMember);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("organiser");
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["team"], queryFn: () => fetchTeam() });

  const change = useMutation({
    mutationFn: (input: { userId: string; role: Role }) =>
      input.role === "viewer"
        ? remove({ data: { userId: input.userId } })
        : saveRole({ data: input }),
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

  const sendInvite = useMutation({
    mutationFn: () =>
      invite({ data: { campaignId: data!.campaignId!, email, role: inviteRole } }),
    onSuccess: async (r) => {
      toast.success(
        r.result === "added"
          ? "They already had an account, and are now on the team."
          : "Invite sent. They get an email to set their password, then join the team.",
      );
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const header = (
    <div className="vh">
      <div>
        <span className="eyebrow">System · team</span>
        <h1>
          Who gets <span className="serif">in.</span>
        </h1>
        <p className="meta">
          Only this campaign's people. Invite by email, or admit people who signed in on the
          campaign's address. Nobody sees anything until they have a role.
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
          <p className="f-note">
            Only the candidate or campaign manager can see and change who is on the team.
          </p>
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
          <h2>Invite someone</h2>
        </div>
        <form
          className="campaign-form"
          onSubmit={(e) => {
            e.preventDefault();
            sendInvite.mutate();
          }}
        >
          <label>
            <span className="eyebrow">Email</span>
            <input
              className="team-select"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span className="eyebrow">Role</span>
            <select
              className="team-select"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_COPY[r].name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn--primary" type="submit" disabled={sendInvite.isPending}>
            {sendInvite.isPending ? "Inviting…" : "Invite"}
          </button>
        </form>
        {data.invites.length > 0 ? (
          <ul className="team-list">
            {data.invites.map((i) => (
              <li key={i.id} className="team-row">
                <div className="team-who">
                  <span className="mono">{i.email}</span>
                  <small>
                    Invited as {ROLE_COPY[i.role].name} · {day(i.createdAt)} · hasn't set a
                    password yet
                  </small>
                </div>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() =>
                    invite({ data: { campaignId: data.campaignId!, email: i.email, role: i.role } })
                      .then(() => toast.success("Invite sent again."))
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  Resend invite
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

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
          Finance is for the candidate and campaign manager only. The database enforces this, so
          it's not just a hidden menu item. Launching polls, which sends SMS, is limited the same way.
        </p>
      </div>
    </section>
  );
}
