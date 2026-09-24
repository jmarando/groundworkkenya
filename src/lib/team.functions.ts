// Who is on the team, and who is waiting at the door.
//
// Signup is open, so anyone can create an account. An account grants nothing:
// a new user holds the 'viewer' marker, which is_team_member() excludes, and
// sees a holding screen until an admin gives them a role here.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ROLES = ["admin", "manager", "organiser", "agent"] as const;
export type Role = (typeof ROLES)[number] | "viewer";

export const ROLE_COPY: Record<Role, { name: string; blurb: string }> = {
  admin: { name: "Admin", blurb: "Everything, including money and who gets in." },
  manager: { name: "Manager", blurb: "Everything except admitting people." },
  organiser: { name: "Organiser", blurb: "People, poll results, inbox and field. No finance." },
  agent: { name: "Agent", blurb: "Field work: walk lists and canvassing." },
  viewer: { name: "Waiting", blurb: "Signed up, not yet admitted. Sees nothing." },
};

export type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  isSelf: boolean;
  joinedAt: string | null;
};

const RANK: Record<Role, number> = { admin: 4, manager: 3, organiser: 2, agent: 1, viewer: 0 };

export const getTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ canManage: boolean; members: Member[] }> => {
    const sb = context.supabase;
    const { data: mine } = await sb.from("user_roles").select("role").eq("user_id", context.userId);
    const canManage = (mine ?? []).some((r) => r.role === "admin");
    // Only admins can read everyone's role, so only admins get a list that
    // is not misleading.
    if (!canManage) return { canManage, members: [] };

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      sb.from("profiles").select("user_id, full_name, email, created_at"),
      sb.from("user_roles").select("user_id, role"),
    ]);

    const roleOf = new Map<string, Role>();
    for (const r of roles ?? []) {
      const role = r.role as Role;
      const prev = roleOf.get(r.user_id);
      if (!prev || RANK[role] > RANK[prev]) roleOf.set(r.user_id, role);
    }

    const members = (profiles ?? []).map((p) => ({
      userId: p.user_id,
      name: p.full_name,
      email: p.email,
      role: roleOf.get(p.user_id) ?? "viewer",
      isSelf: p.user_id === context.userId,
      joinedAt: p.created_at,
    }));
    members.sort(
      (a, b) =>
        Number(a.role !== "viewer") - Number(b.role !== "viewer") ||
        RANK[b.role] - RANK[a.role] ||
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
    );
    return { canManage, members };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: Role }) => {
    if (!input?.userId) throw new Error("Which person?");
    if (!(input.role in RANK)) throw new Error("Unknown role.");
    return input;
  })
  .handler(async ({ data, context }) => {
    // One database call: the role check, the last-admin guard and the swap
    // happen together, so an admin demoting themselves is never left roleless.
    const { error } = await context.supabase.rpc("set_member_role", {
      _user_id: data.userId,
      _role: data.role,
    });
    if (error) throw new Error(error.message || "Only an admin can change roles.");
    return { ok: true };
  });
