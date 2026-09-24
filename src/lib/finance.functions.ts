import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
