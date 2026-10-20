// Auto-calls: a recorded message, in the candidate's cloned voice, a recording, or a standard
// voice, played by phone to people who agreed to calls. The candidate and managers clone the voice
// (with the candidate's recorded consent), make the audio, test it on their own phone, then send
// it in batches; Twilio reports each call (voice_calls, schema 42). The office reads the results.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRINCIPAL_ROLES } from "@/lib/access";
import { spokenScript } from "@/lib/autocall";
import type { BroadcastAudience } from "@/lib/broadcast.functions";
import {
  describeCall,
  phoneDigits,
  tallyCalls,
  twilioError,
  type BlastTally,
} from "@/lib/call-status";
import { requireOffice, requireRole } from "@/lib/require-role";
import { clean as cleanAudience, matches as inAudience } from "@/lib/wa-broadcast.functions";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: schema 42 is newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  storage?: any;
};

const BUCKET = "voice-messages";
const BATCH = 15;
const AUDIO = /^audio\/(mpeg|mp3|mp4|x-m4a|m4a|wav|x-wav|webm|ogg|aac)$/;

type Upload = { name: string; type: string; base64: string };

function decode(u: Upload, maxBytes: number): { name: string; type: string; bytes: Uint8Array } {
  if (!AUDIO.test(u.type)) throw new Error("Use an audio file: MP3, M4A, WAV, WebM or OGG.");
  const bytes = Uint8Array.from(Buffer.from(u.base64, "base64"));
  if (bytes.length < 2000) throw new Error("That recording is empty.");
  if (bytes.length > maxBytes) throw new Error("That recording is too large.");
  return { name: u.name.replace(/[^\w.-]/g, "_").slice(0, 80) || "recording", type: u.type, bytes };
}

async function campaignOf(sb: Client) {
  const { data: id } = (await sb.rpc("my_campaign")) as { data: unknown };
  const { data } = (await sb
    .from("campaigns")
    .select("id, name, candidate")
    .eq("id", String(id))
    .maybeSingle()) as { data: { id: string; name: string; candidate: string | null } | null };
  if (!data) throw new Error("No campaign.");
  return data;
}

async function store(campaignId: string, bytes: Uint8Array, type: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ext =
    type.includes("mpeg") || type.includes("mp3") ? "mp3" : (type.split("/")[1] ?? "audio");
  const path = `${campaignId}/${crypto.randomUUID()}.${ext.replace(/^x-/, "")}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error("The audio couldn't be stored.");
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export type Blast = {
  id: string;
  title: string;
  script: string;
  language: "en" | "sw";
  source: "clone" | "upload" | "standard";
  audioUrl: string | null;
  disclose: boolean;
  status: "draft" | "calling" | "done";
  createdAt: string;
  tally: BlastTally;
};

export type AutoCallData = {
  ready: { twilio: boolean; reports: boolean; voice: boolean };
  /** The number calls come from, so the team knows what voters see. */
  from: string | null;
  voice: { name: string; createdAt: string } | null;
  candidate: string;
  canWrite: boolean;
  blasts: Blast[];
};

export const getAutoCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutoCallData> => {
    const role = await requireOffice(context.supabase, "Auto-calls are for the campaign office.");
    const sb = context.supabase as unknown as Client;
    const { twilioVoiceConfigured } = await import("@/lib/twilio.server");
    const { elevenConfigured } = await import("@/lib/elevenlabs.server");
    const campaign = await campaignOf(sb);
    const [{ data: voice }, { data: blasts }] = (await Promise.all([
      sb.from("campaign_voices").select("name, created_at").maybeSingle(),
      sb.from("voice_blasts").select("*").order("created_at", { ascending: false }).limit(20),
    ])) as [
      { data: { name: string; created_at: string } | null },
      { data: Record<string, unknown>[] | null },
    ];
    const ids = (blasts ?? []).map((b) => String(b["id"]));
    const { data: calls } = ids.length
      ? ((await sb
          .from("voice_calls")
          .select("blast_id, kind, status, answered_by, duration, digits, error")
          .in("blast_id", ids)
          .eq("kind", "blast")
          .limit(20000)) as {
          data: (Parameters<typeof tallyCalls>[0][number] & { blast_id: string })[] | null;
        })
      : { data: [] };
    const from = process.env["TWILIO_FROM_NUMBER"]?.trim() ?? null;
    return {
      ready: {
        twilio: twilioVoiceConfigured(),
        reports: Boolean(process.env["TWILIO_CALLBACK_TOKEN"]),
        voice: elevenConfigured(),
      },
      from,
      voice: voice ? { name: voice.name, createdAt: voice.created_at } : null,
      candidate: campaign.candidate ?? campaign.name,
      canWrite: PRINCIPAL_ROLES.includes(role),
      blasts: (blasts ?? []).map((b) => ({
        id: String(b["id"]),
        title: String(b["title"]),
        script: String(b["script"] ?? ""),
        language: b["language"] === "sw" ? "sw" : "en",
        source: (["clone", "upload", "standard"].find((x) => x === b["source"]) ??
          "standard") as Blast["source"],
        audioUrl: (b["audio_url"] as string | null) ?? null,
        disclose: b["disclose"] !== false,
        status: (["draft", "calling", "done"].find((x) => x === b["status"]) ??
          "draft") as Blast["status"],
        createdAt: String(b["created_at"]),
        tally: tallyCalls((calls ?? []).filter((c) => c.blast_id === b["id"])),
      })),
    };
  });

/** The candidate's voice cloned from their recordings, with their consent on record. */
export const cloneCandidateVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; consentNote: string; files: Upload[] }) => {
    const name = String(input?.name ?? "")
      .trim()
      .slice(0, 100);
    const consentNote = String(input?.consentNote ?? "")
      .trim()
      .slice(0, 1000);
    if (!name) throw new Error("Name the voice.");
    if (consentNote.length < 10)
      throw new Error("Say how and when the candidate agreed to their voice being cloned.");
    const files = (input?.files ?? []).slice(0, 5);
    if (!files.length) throw new Error("Add at least one recording of the candidate speaking.");
    return { name, consentNote, files };
  })
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers set the voice.",
    );
    const sb = context.supabase as unknown as Client;
    const { cloneVoice, deleteVoice } = await import("@/lib/elevenlabs.server");
    const files = data.files.map((f) => decode(f, 12_000_000));
    const voiceId = await cloneVoice(data.name, files);
    const { data: old } = (await sb.from("campaign_voices").select("voice_id").maybeSingle()) as {
      data: { voice_id: string } | null;
    };
    const { error } = await sb.from("campaign_voices").upsert(
      {
        voice_id: voiceId,
        name: data.name,
        consent_note: data.consentNote,
        consented_by: context.userId,
        created_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id" },
    );
    if (error) {
      await deleteVoice(voiceId);
      throw new Error("The voice couldn't be saved.");
    }
    if (old?.voice_id && old.voice_id !== voiceId) await deleteVoice(old.voice_id);
    return { ok: true };
  });

export const removeCandidateVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers set the voice.",
    );
    const sb = context.supabase as unknown as Client;
    const { data: old } = (await sb.from("campaign_voices").select("voice_id").maybeSingle()) as {
      data: { voice_id: string } | null;
    };
    if (old) {
      const { deleteVoice } = await import("@/lib/elevenlabs.server");
      await deleteVoice(old.voice_id);
      await sb.from("campaign_voices").delete().neq("voice_id", "");
    }
    return { ok: true };
  });

/** A new auto-call with its audio made: spoken in the cloned voice, uploaded, or read by Twilio. */
export const saveBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      title: string;
      script: string;
      language: string;
      source: string;
      disclose: boolean;
      upload?: Upload | null;
    }) => {
      const title = String(input?.title ?? "")
        .trim()
        .slice(0, 120);
      const script = String(input?.script ?? "")
        .trim()
        .slice(0, 2500);
      const language = input?.language === "sw" ? "sw" : "en";
      const source = ["clone", "upload", "standard"].find((x) => x === input?.source);
      if (!title) throw new Error("Name the auto-call.");
      if (!source) throw new Error("Choose whose voice it is.");
      if (source !== "upload" && script.length < 10) throw new Error("Write what the call says.");
      if (source === "upload" && !input.upload) throw new Error("Add the recording.");
      if (source === "standard" && language === "sw")
        throw new Error(
          "The standard voice only speaks English. Use the candidate's voice or a recording for Kiswahili.",
        );
      return {
        title,
        script,
        language: language as "en" | "sw",
        source: source as "clone" | "upload" | "standard",
        disclose: input?.disclose !== false,
        upload: input?.upload ?? null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers make auto-calls.",
    );
    const sb = context.supabase as unknown as Client;
    const campaign = await campaignOf(sb);
    let audioUrl: string | null = null;
    if (data.source === "clone") {
      const { data: voice } = (await sb
        .from("campaign_voices")
        .select("voice_id")
        .maybeSingle()) as {
        data: { voice_id: string } | null;
      };
      if (!voice) throw new Error("Clone the candidate's voice first.");
      const { speak } = await import("@/lib/elevenlabs.server");
      const mp3 = await speak(
        voice.voice_id,
        spokenScript(data, campaign.candidate ?? campaign.name),
        data.language,
      );
      audioUrl = await store(campaign.id, mp3, "audio/mpeg");
    } else if (data.source === "upload" && data.upload) {
      const f = decode(data.upload, 10_000_000);
      audioUrl = await store(campaign.id, f.bytes, f.type);
    }
    const { data: row, error } = (await sb
      .from("voice_blasts")
      .insert({
        title: data.title,
        script: data.script,
        language: data.language,
        source: data.source,
        audio_url: audioUrl,
        disclose: data.disclose,
      })
      .select("id")
      .single()) as { data: { id: string } | null; error: unknown };
    if (error || !row) throw new Error("The auto-call couldn't be saved.");
    return { id: row.id, audioUrl };
  });

/** The auto-call played to the sender's own phone first. */
export const testBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; phone: string }) => {
    if (!/^[0-9a-f-]{36}$/.test(String(input?.id ?? ""))) throw new Error("No such auto-call.");
    const phone = phoneDigits(String(input?.phone ?? ""));
    if (!phone) throw new Error("Enter your phone number, like 0712 345 678.");
    return { id: input.id, phone };
  })
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers make auto-calls.",
    );
    return place(context.supabase as unknown as Client, {
      kind: "test",
      blast_id: data.id,
      to_phone: data.phone,
    });
  });

async function place(
  sb: Client,
  row: { kind: "test" | "blast"; blast_id: string; to_phone: string; person_id?: string },
): Promise<{ ok: true; callId: string } | { ok: false; error: string }> {
  const { twilioVoiceConfigured, autoCall } = await import("@/lib/twilio.server");
  if (!twilioVoiceConfigured())
    return { ok: false, error: "Calling starts once the Twilio number is added." };
  if (!process.env["TWILIO_CALLBACK_TOKEN"])
    return { ok: false, error: "Twilio's call reports aren't set up (TWILIO_CALLBACK_TOKEN)." };
  const { data: ins, error } = (await sb.from("voice_calls").insert(row).select("id").single()) as {
    data: { id: string } | null;
    error: { code?: string } | null;
  };
  if (error?.code === "23505") return { ok: false, error: "already" };
  if (error || !ins) return { ok: false, error: "The call couldn't be recorded." };
  const r = await autoCall(row.to_phone, ins.id);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  if (!r.ok) {
    await admin
      .from("voice_calls")
      .update({ status: "failed", error: r.error.slice(0, 300) })
      .eq("id", ins.id);
    return { ok: false, error: twilioError(r.error) ?? "Twilio couldn't place the call." };
  }
  await admin.from("voice_calls").update({ sid: r.sid, status: "initiated" }).eq("id", ins.id);
  return { ok: true, callId: ins.id };
}

/** How many in the audience agreed to calls and haven't been called by this auto-call. */
async function audience(sb: Client, blastId: string | null, a: BroadcastAudience) {
  const people: { id: string; phone: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = (await sb
      .from("people")
      .select("id, phone, ward_id, segment, support_score")
      .eq("consent_call", true)
      .eq("opted_out", false)
      .order("id")
      .range(from, from + 999)) as {
      data:
        | {
            id: string;
            phone: string;
            ward_id: string | null;
            segment: string | null;
            support_score: number;
          }[]
        | null;
      error: unknown;
    };
    if (error) throw new Error("Could not load the audience.");
    for (const p of data ?? []) {
      const phone = phoneDigits(p.phone ?? "");
      if (phone && inAudience(p, a)) people.push({ id: p.id, phone });
    }
    if (!data || data.length < 1000) break;
  }
  if (!blastId) return { people, todo: people };
  const { data: done } = (await sb
    .from("voice_calls")
    .select("person_id")
    .eq("blast_id", blastId)
    .eq("kind", "blast")
    .limit(50000)) as { data: { person_id: string | null }[] | null };
  const seen = new Set((done ?? []).map((d) => d.person_id));
  return { people, todo: people.filter((p) => !seen.has(p.id)) };
}

export const countCallable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { blastId?: string | null; audience: Partial<BroadcastAudience> }) => ({
    blastId: /^[0-9a-f-]{36}$/.test(String(input?.blastId ?? "")) ? String(input.blastId) : null,
    audience: cleanAudience(input?.audience),
  }))
  .handler(async ({ data, context }) => {
    await requireOffice(context.supabase);
    const r = await audience(context.supabase as unknown as Client, data.blastId, data.audience);
    return { consented: r.people.length, toCall: r.todo.length };
  });

export type SendBlastResult = {
  placed: number;
  failed: number;
  remaining: number;
  lastError: string | null;
};

/** One batch of the auto-call to the audience; the page keeps pressing until none are left. */
export const sendBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; audience: Partial<BroadcastAudience>; limit?: number }) => {
    if (!/^[0-9a-f-]{36}$/.test(String(input?.id ?? ""))) throw new Error("No such auto-call.");
    const limit = Math.round(Number(input?.limit));
    return {
      id: input.id,
      audience: cleanAudience(input?.audience),
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 5000) : 5000,
    };
  })
  .handler(async ({ data, context }): Promise<SendBlastResult> => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers make auto-calls.",
    );
    const sb = context.supabase as unknown as Client;
    const { data: blast } = (await sb
      .from("voice_blasts")
      .select("id, source, audio_url, script")
      .eq("id", data.id)
      .maybeSingle()) as {
      data: { id: string; source: string; audio_url: string | null; script: string } | null;
    };
    if (!blast) throw new Error("That auto-call isn't on record.");
    if (!blast.audio_url && blast.source !== "standard")
      throw new Error("This auto-call has no audio.");
    const { people, todo } = await audience(sb, blast.id, data.audience);
    const calledAlready = people.length - todo.length;
    const room = Math.max(0, data.limit - calledAlready);
    const batch = todo.slice(0, Math.min(BATCH, room));
    await sb
      .from("voice_blasts")
      .update({ status: "calling", updated_at: new Date().toISOString() })
      .eq("id", blast.id);
    let placed = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (const p of batch) {
      const r = await place(sb, {
        kind: "blast",
        blast_id: blast.id,
        to_phone: p.phone,
        person_id: p.id,
      });
      if (r.ok) placed++;
      else if (r.error !== "already") {
        failed++;
        lastError = r.error;
        // The account or number refused: stop rather than fail every call the same way.
        if (/Twilio number|Kenya|trial|refused the account|reports aren't set up/.test(r.error))
          break;
      }
      // Twilio places about one call a second on a standard account.
      await new Promise((ok) => setTimeout(ok, 1100));
    }
    const remaining = Math.max(0, Math.min(todo.length, room) - placed - failed);
    if (remaining === 0)
      await sb
        .from("voice_blasts")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", blast.id);
    return { placed, failed, remaining, lastError };
  });

/** An auto-call's calls, the latest first, each in words. */
export const getBlastCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/.test(String(input?.id ?? ""))) throw new Error("No such auto-call.");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    await requireOffice(context.supabase);
    const sb = context.supabase as unknown as Client;
    const { data: calls } = (await sb
      .from("voice_calls")
      .select(
        "id, kind, status, answered_by, duration, digits, error, to_phone, person_id, updated_at",
      )
      .eq("blast_id", data.id)
      .order("created_at", { ascending: false })
      .limit(5000)) as {
      data:
        | {
            id: string;
            kind: "blast" | "test";
            status: string;
            answered_by: string | null;
            duration: number | null;
            digits: string | null;
            error: string | null;
            to_phone: string;
            person_id: string | null;
            updated_at: string;
          }[]
        | null;
    };
    const rows = calls ?? [];
    const ids = [...new Set(rows.slice(0, 60).flatMap((c) => (c.person_id ? [c.person_id] : [])))];
    const { data: people } = ids.length
      ? ((await sb.from("people").select("id, full_name").in("id", ids)) as {
          data: { id: string; full_name: string | null }[] | null;
        })
      : { data: [] };
    const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
    return {
      tally: tallyCalls(rows.filter((c) => c.kind === "blast")),
      calls: rows.slice(0, 60).map((c) => ({
        id: c.id,
        who:
          c.kind === "test"
            ? "Test call"
            : (name.get(c.person_id ?? "") ?? `…${c.to_phone.slice(-3)}`),
        view: describeCall(c),
        at: c.updated_at,
      })),
    };
  });
