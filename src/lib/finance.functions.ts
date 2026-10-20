import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "@/lib/require-role";

/**
 * Approve a pending expense. approve_expense() enforces the rules — admins and
 * managers only, pending only, and never without a supporting document — and
 * records who approved it and when.
 */
export const approveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Which expense?");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_expense", { _expense_id: data.id });
    if (error) {
      throw new Error(error.code === "P0001" ? error.message : "Could not approve that expense.");
    }
    return { ok: true };
  });

const ROLES = ["super", "candidate", "manager"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const EXPENSE_CATEGORIES = [
  "operations",
  "ads",
  "comms",
  "events",
  "transport",
  "materials",
  "staff",
  "stipends",
  "creators",
  "other",
] as const;
export const DONOR_TYPES = ["individual", "organisation", "party", "candidate"] as const;
export const PAY_METHODS = ["mpesa", "bank", "cash", "cheque"] as const;

export type NewContribution = {
  donorName: string;
  donorType: (typeof DONOR_TYPES)[number];
  amountKes: number;
  method: (typeof PAY_METHODS)[number];
  reference: string | null;
  receivedOn: string;
};
export type NewExpense = {
  description: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  vendor: string | null;
  amountKes: number;
  reference: string | null;
  incurredOn: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Enter an amount in shillings above zero.");
  if (n > 1_000_000_000) throw new Error("That amount is too large to be right.");
  return Math.round(n * 100) / 100;
};
const pastDay = (v: unknown) => {
  const d = text(v, 10);
  if (!DAY.test(d) || Number.isNaN(Date.parse(d))) throw new Error("Pick the date.");
  if (Date.parse(d) > Date.now() + 864e5) throw new Error("The date can't be in the future.");
  return d;
};

/** A contribution as typed into Finance; throws the words to show for anything wrong. */
export function cleanContribution(input: unknown): NewContribution {
  const i = (input ?? {}) as Record<string, unknown>;
  const donorName = text(i["donorName"], 200);
  if (!donorName) throw new Error("Who gave it? Put the donor's name.");
  const donorType = DONOR_TYPES.find((t) => t === i["donorType"]);
  if (!donorType) throw new Error("Say what kind of donor it is.");
  const method = PAY_METHODS.find((t) => t === i["method"]);
  if (!method) throw new Error("Say how it was paid.");
  const reference = text(i["reference"], 80) || null;
  if (method !== "cash" && !reference)
    throw new Error("Add the M-Pesa code, bank or cheque reference.");
  return {
    donorName,
    donorType,
    amountKes: amount(i["amountKes"]),
    method,
    reference,
    receivedOn: pastDay(i["receivedOn"]),
  };
}

/** An expense as typed into Finance; throws the words to show for anything wrong. */
export function cleanExpense(input: unknown): NewExpense {
  const i = (input ?? {}) as Record<string, unknown>;
  const description = text(i["description"], 300);
  if (!description) throw new Error("Say what it was for.");
  const category = EXPENSE_CATEGORIES.find((c) => c === i["category"]);
  if (!category) throw new Error("Pick a category.");
  return {
    description,
    category,
    vendor: text(i["vendor"], 120) || null,
    amountKes: amount(i["amountKes"]),
    reference: text(i["reference"], 80) || null,
    incurredOn: pastDay(i["incurredOn"]),
  };
}

/** Noon in Nairobi on a day, so the entry sits on that day whatever the reader's time zone. */
const nairobiNoon = (day: string) => `${day}T12:00:00+03:00`;

export const recordContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleanContribution(input))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, ROLES, "Only the candidate and managers record money.");
    const { error } = await context.supabase.from("contributions").insert({
      donor_name: data.donorName,
      donor_type: data.donorType,
      amount_kes: data.amountKes,
      method: data.method,
      reference: data.reference,
      received_at: nairobiNoon(data.receivedOn),
    });
    if (error) throw new Error("Could not record the contribution.");
    return { ok: true };
  });

export const recordExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleanExpense(input))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, ROLES, "Only the candidate and managers record money.");
    // Always pending: approval is its own step, by the authorised person, with the receipt.
    const { error } = await context.supabase.from("expenses").insert({
      description: data.description,
      category: data.category,
      vendor: data.vendor,
      amount_kes: data.amountKes,
      reference: data.reference,
      status: "pending",
      incurred_at: nairobiNoon(data.incurredOn),
    });
    if (error) throw new Error("Could not record the expense.");
    return { ok: true };
  });
