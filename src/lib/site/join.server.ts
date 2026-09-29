// Recording a volunteer who signed up on a campaign's website: in that
// campaign's People list (never the channel owner's), with a text asking the
// number to confirm. Runs with the service role, so it keeps to the site's
// campaign itself.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  logEvent,
  openConversation,
  requestSmsConsent,
  upsertPersonByPhone,
} from "@/lib/inbound.server";
import { volunteerConsentText } from "@/lib/polls.engine";
import { HELPS, type JoinValues } from "@/lib/site/render";

type Sb = SupabaseClient<Database>;
type PeopleUpdate = Database["public"]["Tables"]["people"]["Update"];

export type SiteRef = {
  campaignId: string;
  /** How the campaign signs its texts: the candidate's name. */
  label: string;
};

export async function recordVolunteer(sb: Sb, site: SiteRef, v: JoinValues): Promise<boolean> {
  const person = await upsertPersonByPhone(sb, v.phone, "website", site.campaignId);
  if (!person) return false;

  // Anyone can type anyone's number: fill in what the campaign lacks, and
  // never overwrite what it already has.
  const { data: current } = await sb
    .from("people")
    .select("full_name, ward_id, tags")
    .eq("id", person.id)
    .maybeSingle();
  const patch: PeopleUpdate = { tags: [...new Set([...(current?.tags ?? []), "Volunteer"])] };
  if (!current?.full_name?.trim()) patch.full_name = v.name;
  if (!current?.ward_id && v.ward) patch.ward_id = v.ward;
  await sb.from("people").update(patch).eq("id", person.id);

  const offers = v.helps
    .map((h) => HELPS.find((x) => x.key === h)?.label.en)
    .filter(Boolean)
    .join(", ");
  await logEvent(
    sb,
    person.id,
    "volunteer",
    "web",
    `Signed up on the website${offers ? `: ${offers}` : ""}`,
  );
  await openConversation(
    sb,
    person.id,
    "Volunteer sign-up",
    `${v.name} signed up on the website${offers ? ` (${offers.toLowerCase()})` : ""}. Not yet confirmed by SMS.`,
  );
  await requestSmsConsent(sb, person, volunteerConsentText(site.label));
  return true;
}
