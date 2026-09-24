// Adding people from the console. The rules live in the database functions
// (add_person, begin_person_import, import_people_chunk); these pass requests
// through under the caller's own JWT, so row level security applies.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeKePhone } from "@/lib/phone";
import { SUPPORT_SCORE, type ImportRow } from "@/lib/people";

/** The database's own sentence where it has one; otherwise say which it was. */
const friendly = (e: { code?: string; message?: string }, denied: string) =>
  e.code === "P0001" && e.message
    ? e.message
    : e.message?.includes("row-level security")
      ? denied
      : "Something went wrong. Try again.";

export type AddPersonInput = {
  phone: string;
  name: string;
  wardId: string | null;
  segment: string | null;
  language: "sw" | "en";
  support: 1 | 2 | 3 | 4 | 5 | null;
  notes: string;
  consent: { sms: boolean; whatsapp: boolean; call: boolean };
  consentSource: string;
};

export const addPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AddPersonInput) => {
    const phone = normalizeKePhone(input?.phone);
    if (!phone) throw new Error("Use a Kenyan mobile number like 0712 345 678.");
    if (!String(input.name ?? "").trim()) throw new Error("Add their name.");
    return { ...input, phone };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("add_person", {
      _phone: data.phone,
      _full_name: data.name,
      _ward_id: data.wardId,
      _segment: data.segment,
      _language: data.language,
      _support_score: data.support ? SUPPORT_SCORE[data.support] : null,
      _notes: data.notes,
      _consent: data.consent,
      _consent_source: data.consentSource,
    });
    if (error) throw new Error(friendly(error, "Only admitted team members can add people."));
    return { id: String((result as { id?: string } | null)?.id ?? "") };
  });

export const beginImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      filename: string;
      source: string;
      consentSource: string | null;
      rowsTotal: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("begin_person_import", {
      _filename: data.filename,
      _source: data.source,
      _consent_source: data.consentSource ?? "",
      _rows_total: data.rowsTotal,
    });
    if (error) throw new Error(friendly(error, "Only an admin or manager can import people."));
    return { id: String(id) };
  });

export type ChunkResult = { created: number; updated: number; skipped: number; consented: number };

export const importChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { importId: string; rows: ImportRow[] }) => {
    if (!input?.importId) throw new Error("Start the import first.");
    if (!Array.isArray(input.rows) || input.rows.length > 1000)
      throw new Error("Send at most 1,000 rows at a time.");
    return input;
  })
  .handler(async ({ data, context }): Promise<ChunkResult> => {
    const { data: result, error } = await context.supabase.rpc("import_people_chunk", {
      _import_id: data.importId,
      _rows: data.rows.map((r) => ({
        phone: r.phone,
        name: r.name,
        wardId: r.wardId,
        segment: r.segment,
        language: r.language,
        sms: r.sms,
        whatsapp: r.whatsapp,
        call: r.call,
      })),
    });
    if (error) throw new Error(friendly(error, "Only an admin or manager can import people."));
    const r = (result ?? {}) as Partial<ChunkResult>;
    return {
      created: r.created ?? 0,
      updated: r.updated ?? 0,
      skipped: r.skipped ?? 0,
      consented: r.consented ?? 0,
    };
  });
