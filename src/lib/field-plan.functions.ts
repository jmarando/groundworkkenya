// The field plan's server side, as the signed-in person: the database decides who plans (the
// candidate, managers and organisers) and keeps every list in the caller's campaign.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, type PlanList, type PlanWard, type Shift } from "@/lib/field-plan";
import { readTeam, type TeamMember } from "@/lib/walk-lists.functions";
import { refused, type Failure } from "@/lib/db-error";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;
type Sb = {
  rpc: (fn: string, args?: Row) => PromiseLike<{ data: unknown; error: Failure | null }>;
};

const text = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rows = (d: unknown): Row[] =>
  Array.isArray(d) ? (d.filter((r) => r && typeof r === "object") as Row[]) : [];
const shiftOf = (v: unknown): Shift | null =>
  v === "morning" || v === "afternoon" || v === "day" ? v : null;

export type FieldPlanData = {
  from: string;
  to: string;
  lists: PlanList[];
  wards: PlanWard[];
  team: TeamMember[];
};

export const getFieldPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string }) => {
    if (!input || !DATE.test(String(input.from))) throw new Error("Which fortnight?");
    return { from: input.from };
  })
  .handler(async ({ data, context }): Promise<FieldPlanData> => {
    const sb = context.supabase as unknown as Sb;
    const to = addDays(data.from, 13);
    const [lists, wards, team] = await Promise.all([
      sb.rpc("field_plan", { _from: data.from, _to: to }),
      sb.rpc("field_plan_wards", { _from: data.from, _to: to }),
      readTeam(context.supabase as never),
    ]);
    if (lists.error) throw refused(lists.error, "Could not read the field plan.");
    if (wards.error) throw refused(wards.error, "Could not read the wards.");
    return {
      from: data.from,
      to,
      team: team ?? [],
      lists: rows(lists.data).flatMap((r) => {
        const id = text(r["id"]);
        const name = text(r["name"]);
        const status =
          r["status"] === "draft" || r["status"] === "out" || r["status"] === "done"
            ? r["status"]
            : null;
        return id && name && status
          ? [
              {
                id,
                name,
                status,
                wardId: text(r["ward_id"]),
                wardName: text(r["ward_name"]),
                centreName: text(r["centre_name"]),
                givenTo: text(r["given_to"]),
                givenToName: text(r["given_to_name"]),
                dueOn: text(r["due_on"]),
                shift: shiftOf(r["shift"]),
                doors: num(r["doors"]),
                done: num(r["done"]),
              },
            ]
          : [];
      }),
      wards: rows(wards.data).flatMap((r) => {
        const wardId = text(r["ward_id"]);
        const name = text(r["name"]);
        return wardId && name
          ? [
              {
                wardId,
                slug: text(r["slug"]) ?? "",
                name,
                targetVotes: num(r["target_votes"]),
                doorsPlanned: num(r["doors_planned"]),
                doorsKnocked: num(r["doors_knocked"]),
                spoke: num(r["spoke"]),
                supporters: num(r["supporters"]),
              },
            ]
          : [];
      }),
    };
  });

/** Puts a list on a day and shift (or takes it off with no day), and gives it to someone if named. */
export const scheduleList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; dueOn: string | null; shift: Shift | null; to: string | null }) => {
      if (!input || !UUID.test(String(input.id))) throw new Error("Which list?");
      if (input.dueOn !== null && !DATE.test(String(input.dueOn))) throw new Error("Pick a day.");
      if (input.to !== null && !UUID.test(String(input.to)))
        throw new Error("Pick someone on the team.");
      return { id: input.id, dueOn: input.dueOn, shift: shiftOf(input.shift), to: input.to };
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Sb;
    const { error } = await sb.rpc("schedule_walk_list", {
      _id: data.id,
      _due_on: data.dueOn,
      _shift: data.shift,
      _to: data.to,
    });
    if (error) throw refused(error, "Could not plan that list.");
    return { ok: true as const };
  });
