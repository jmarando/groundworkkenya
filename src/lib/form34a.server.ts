// Polling-station result forms over USSD and WhatsApp, against the database:
// 34A for a presidential campaign, 37A for a governor's, 35A for an MP's (see
// race.ts). The screens and caption reading are pure functions in form34a.ts;
// this finds the agent's station, its campaign's ballot and race, files
// through file_stream_result(), and records photos through record_form_photo().
// Both run with the service role, with the number the network gave: that
// number is the agent's credential, and the station it is on decides the
// campaign.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { ascii, form34aStep, parseFormCaption, USSD_MAX, type Form34aStation } from "@/lib/form34a";
import { resultForm } from "@/lib/race";
import { channelCampaignId } from "@/lib/tenant.server";

type Sb = SupabaseClient<Database>;

export type AgentStation = Form34aStation & { id: string; campaignId: string };

const fit = (s: string) => (s.length <= USSD_MAX ? s : s.slice(0, USSD_MAX));

/** The stations this number is the agent for, in whichever campaign. */
export async function agentStations(sb: Sb, phone: string): Promise<AgentStation[]> {
  const { data } = await sb
    .from("polling_stations")
    .select("id, code, name, streams, registered_voters, campaign_id")
    .eq("agent_phone", phone)
    .order("code")
    .limit(10);
  return (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    streams: s.streams ?? 1,
    registered: s.registered_voters ?? 0,
    campaignId: s.campaign_id,
  }));
}

/** The result form for a campaign's race: "37A" for a governor's campaign. */
export async function campaignForm(sb: Sb, campaignId: string): Promise<string> {
  const { data } = await sb.from("campaigns").select("level").eq("id", campaignId).maybeSingle();
  return resultForm(data?.level);
}

/**
 * The WhatsApp number agents send photos to: the one the webhook listens on,
 * which belongs to the campaign that owns the channels.
 */
async function campaignWhatsApp(sb: Sb): Promise<string | null> {
  const owner = await channelCampaignId(sb).catch(() => null);
  if (!owner) return null;
  const { data } = await sb
    .from("social_accounts")
    .select("handle, live")
    .eq("platform", "whatsapp")
    .eq("campaign_id", owner)
    .maybeSingle();
  return data?.live && data.handle ? ascii(data.handle).replace(/\s+/g, "") : null;
}

/**
 * An agent filing on USSD. `inputs` is everything typed after choosing the
 * results form on the menu.
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

  // The station's own campaign: its ballot, and the form its race files.
  const [{ data: ballot }, form] = await Promise.all([
    sb
      .from("ballot_candidates")
      .select("name, party")
      .eq("campaign_id", station.campaignId)
      .order("position"),
    campaignForm(sb, station.campaignId),
  ]);
  const step = form34aStep(station, ballot ?? [], rest, form);
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
  const photo = wa ? ` Tuma picha ya Fomu ${form} kwa WhatsApp ${wa}, andika: ${form} ${tag}` : "";
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
  const r = data as { station: string; stream: number | null; streams: number; level?: string };
  const form = resultForm(r.level);
  return r.stream
    ? `Picha ya Fomu ${form} imepokelewa: ${r.station} mkondo ${r.stream}. Asante.`
    : `Picha imepokelewa kwa ${r.station}, lakini mkondo haujulikani. Itume tena na maelezo, mfano: ${form} ${r.station}/1`;
}
