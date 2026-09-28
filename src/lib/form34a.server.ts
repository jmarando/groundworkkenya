// Form 34A over USSD and WhatsApp, against the database. The screens and the
// caption reading are pure functions in form34a.ts; this finds the agent's
// station and the ballot, files through file_stream_result(), and records
// photos through record_form_photo(). Both run with the service role, with
// the number the network gave: that number is the agent's credential.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { ascii, form34aStep, parseFormCaption, USSD_MAX, type Form34aStation } from "@/lib/form34a";

type Sb = SupabaseClient<Database>;

export type AgentStation = Form34aStation & { id: string };

const fit = (s: string) => (s.length <= USSD_MAX ? s : s.slice(0, USSD_MAX));

/** The stations this number is the agent for. */
export async function agentStations(sb: Sb, phone: string): Promise<AgentStation[]> {
  const { data } = await sb
    .from("polling_stations")
    .select("id, code, name, streams, registered_voters")
    .eq("agent_phone", phone)
    .order("code")
    .limit(10);
  return (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    streams: s.streams ?? 1,
    registered: s.registered_voters ?? 0,
  }));
}

/** The campaign's WhatsApp number, for telling agents where to send the photo. */
async function campaignWhatsApp(sb: Sb): Promise<string | null> {
  const { data } = await sb
    .from("social_accounts")
    .select("handle, live")
    .eq("platform", "whatsapp")
    .maybeSingle();
  return data?.live && data.handle ? ascii(data.handle).replace(/\s+/g, "") : null;
}

/**
 * An agent filing on USSD. `inputs` is everything typed after choosing
 * "Fomu 34A" on the menu.
 */
export async function handleForm34aUssd(sb: Sb, phone: string, inputs: string[]): Promise<string> {
  const stations = await agentStations(sb, phone);
  if (!stations.length) return "END Namba hii si ya ajenti wa kituo. Mjulishe mratibu.";

  let station = stations[0]!;
  let rest = inputs;
  if (stations.length > 1) {
    const pick = inputs[0]?.trim();
    if (pick === undefined) {
      const list = stations
        .slice(0, 5)
        .map((s, i) => `${i + 1}. ${s.code} ${ascii(s.name).slice(0, 20)}`)
        .join("\n");
      return fit(`CON Chagua kituo:\n${list}`);
    }
    const chosen = /^[1-5]$/.test(pick) ? stations[Number(pick) - 1] : undefined;
    if (!chosen) return "END Chaguo si sahihi. Piga tena.";
    station = chosen;
    rest = inputs.slice(1);
  }

  const { data: ballot } = await sb
    .from("ballot_candidates")
    .select("name, party")
    .order("position");
  const step = form34aStep(station, ballot ?? [], rest);
  if (step.kind === "con") return fit(`CON ${step.text}`);
  if (step.kind === "end") return fit(`END ${step.text}`);

  const { data, error } = await sb.rpc("file_stream_result", {
    _phone: phone,
    _station_id: station.id,
    _stream: step.stream,
    _votes: step.votes,
    _rejected: step.rejected,
    _channel: "ussd",
  });
  // The database's refusals are written for this screen.
  if (error) return fit(`END Haijapokelewa. ${ascii(error.message)}`);

  const corrected = (data as { corrected?: boolean } | null)?.corrected === true;
  const tag = `${station.code}/${step.stream}`;
  const wa = await campaignWhatsApp(sb);
  const photo = wa ? ` Tuma picha ya Fomu 34A kwa WhatsApp ${wa}, andika: 34A ${tag}` : "";
  return fit(`END Imepokelewa: ${tag}${corrected ? " (imesahihishwa)" : ""}.${photo}`);
}

/**
 * A WhatsApp image from an agent: record it against the stream it is for and
 * return what to tell them. Null when the sender is not an agent.
 */
export async function recordFormPhoto(
  sb: Sb,
  phone: string,
  message: { id: string; image?: { id?: string; caption?: string } },
): Promise<string | null> {
  const caption = message.image?.caption ?? "";
  const { code, stream } = parseFormCaption(caption);
  const { data, error } = await sb.rpc("record_form_photo", {
    _phone: phone,
    _wa_message_id: message.id,
    _wa_media_id: message.image?.id ?? "",
    _caption: caption,
    _code: code ?? "",
    // 0 is "not said": the database then matches the stream still waiting.
    _stream: stream ?? 0,
  });
  if (error || !data) return null;
  const r = data as { station: string; stream: number | null; streams: number };
  return r.stream
    ? `Picha ya Fomu 34A imepokelewa: ${r.station} mkondo ${r.stream}. Asante.`
    : `Picha imepokelewa kwa ${r.station}, lakini mkondo haujulikani. Itume tena na maelezo, mfano: 34A ${r.station}/1`;
}
