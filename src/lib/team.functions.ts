// Who is on this campaign's team, and who is waiting at the door.
//
// Every person belongs to one campaign. Someone who signs in on a campaign's
// address waits there ('pending') until the candidate or campaign manager
// admits them. People can also be invited by email before they sign up.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ROLES = ["candidate", "manager", "organiser", "agent"] as const;
/** "viewer" is a waiting (pending) member with no access. */
export type Role = (typeof ROLES)[number] | "viewer";

export const ROLE_COPY: Record<Role, { name: string; blurb: string }> = {
  candidate: { name: "Candidate", blurb: "Everything, including money and who gets in." },
  manager: { name: "Campaign manager", blurb: "Everything, including money and who gets in." },
  organiser: { name: "Organiser", blurb: "People, polls, inbox and field. No finance." },
  agent: { name: "Field agent", blurb: "Field work: walk lists and canvassing." },
  viewer: { name: "Waiting", blurb: "Signed in, not yet admitted. Sees nothing." },
};

export type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  isSelf: boolean;
  joinedAt: string | null;
};

export type Invite = { id: string; email: string; role: Role; createdAt: string };

const RANK: Record<Role, number> = { candidate: 4, manager: 3, organiser: 2, agent: 1, viewer: 0 };

export const getTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      canManage: boolean;
      campaignId: string | null;
      members: Member[];
      invites: Invite[];
    }> => {
      const sb = context.supabase;
      const [{ data: campaignId }, { data: myRole }] = await Promise.all([
        sb.rpc("my_campaign"),
        sb.rpc("my_campaign_role"),
      ]);
      const canManage = myRole === "super" || myRole === "candidate" || myRole === "manager";
      if (!canManage || !campaignId) {
        return { canManage: false, campaignId: null, members: [], invites: [] };
      }

      const [{ data: rows }, { data: invites }] = await Promise.all([
        sb
          .from("campaign_members")
          .select("user_id, role, created_at")
          .eq("campaign_id", campaignId as string),
        sb
          .from("campaign_invites")
          .select("id, email, role, created_at")
          .eq("campaign_id", campaignId as string)
          .order("created_at", { ascending: false }),
      ]);
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await sb.from("profiles").select("user_id, full_name, email").in("user_id", ids)
        : { data: [] };
      const profileOf = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      const members: Member[] = (rows ?? []).map((r) => ({
        userId: r.user_id,
        name: profileOf.get(r.user_id)?.full_name ?? null,
        email: profileOf.get(r.user_id)?.email ?? null,
        role: r.role === "pending" ? "viewer" : (r.role as Role),
        isSelf: r.user_id === context.userId,
        joinedAt: r.created_at,
      }));
      members.sort(
        (a, b) =>
          RANK[b.role] - RANK[a.role] ||
          (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
      );
      return {
        canManage,
        campaignId: campaignId as string,
        members,
        invites: (invites ?? []).map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role as Role,
          createdAt: i.created_at,
        })),
      };
    },
  );

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: Role }) => {
    if (!input?.userId) throw new Error("Which person?");
    if (!(input.role in RANK)) throw new Error("Unknown role.");
    return input;
  })
  .handler(async ({ data, context }) => {
    // The role check, the last-candidate guard and the change happen together
    // in the database.
    const { error } = await context.supabase.rpc("set_member_role", {
      _user_id: data.userId,
      _role: data.role === "viewer" ? "pending" : data.role,
    });
    if (error) throw new Error(error.message || "Could not change that role.");
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId) throw new Error("Which person?");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("remove_member", { _user_id: data.userId });
    if (error) throw new Error(error.message || "Could not remove them.");
    return { ok: true };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; email: string; role: Role }) => {
    if (!input?.campaignId) throw new Error("Which campaign?");
    if (!input.email?.includes("@")) throw new Error("Add their email.");
    if (input.role === "viewer" || !(input.role in RANK)) throw new Error("Pick a role.");
    return { ...input, email: input.email.trim().toLowerCase() };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("invite_member", {
      _campaign: data.campaignId,
      _email: data.email,
      _role: data.role as Exclude<Role, "viewer">,
    });
    if (error) throw new Error(error.message || "Could not invite them.");
    if (result === "invited") {
      const { sendInviteEmail } = await import("./invite-email.server");
      await sendInviteEmail(data.campaignId, data.email);
    }
    return { result: result as "added" | "invited" };
  });
