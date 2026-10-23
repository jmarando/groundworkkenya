// What Inbox says about each channel, read from what is actually set up: the SMS provider and the
// live switch, the campaign's own channels (campaign_channels) and its social accounts. Pure.

export type ChannelState = "ok" | "amber" | "off";
export type ChannelStatus = {
  code: string;
  cls: string;
  name: string;
  note: string;
  state: ChannelState;
  /** The pill's words. */
  label: string;
};

export type ChannelFacts = {
  /** An SMS provider is configured and CHANNELS_LIVE is on. */
  smsLive: boolean;
  /** An SMS provider is configured (texts are staged, not sent, until the live switch). */
  smsProvider: boolean;
  /** Africa's Talking is configured (USSD runs through it). */
  ussd: boolean;
  /** The campaign's own rows: kind → status ("not_started", "pending", "live") and address. */
  own: Record<string, { status: string; identifier: string | null } | undefined>;
  /** Connected social accounts: platform → live or not, and the handle. */
  accounts: Record<string, { live: boolean; handle: string } | undefined>;
};

const ownState = (row: ChannelFacts["own"][string]): [ChannelState, string] =>
  row?.status === "live"
    ? ["ok", "Ready"]
    : row?.status === "pending"
      ? ["amber", "Being set up"]
      : ["off", "Not set up"];

const accountState = (a: ChannelFacts["accounts"][string]): [ChannelState, string] =>
  a?.live ? ["ok", "Ready"] : a ? ["amber", "Connected, not live"] : ["off", "Not connected"];

export function channelStatuses(f: ChannelFacts): ChannelStatus[] {
  const [smsState, smsLabel]: [ChannelState, string] = f.smsLive
    ? ["ok", "Ready"]
    : f.smsProvider
      ? ["amber", "Staged, not sending"]
      : ["off", "No provider"];
  const email = ownState(f.own["email"]);
  const wa = ownState(f.own["whatsapp"]);
  const fb = accountState(f.accounts["facebook"]);
  const ig = accountState(f.accounts["instagram"]);
  const x = accountState(f.accounts["x"]);
  const at = (a: ChannelFacts["accounts"][string]) => (a?.handle ? ` (${a.handle})` : "");
  return [
    {
      code: "SMS",
      cls: "ch--sms",
      name: "SMS",
      note: "Two-way texts on the campaign's line.",
      state: smsState,
      label: smsLabel,
    },
    {
      code: "US",
      cls: "ch--us",
      name: "USSD",
      note: "Feature phones: polls, sign-ups and call-me-back requests.",
      state: f.ussd ? "ok" : "off",
      label: f.ussd ? "Ready" : "No provider",
    },
    {
      code: "EM",
      cls: "ch--em",
      name: "Email",
      note: f.own["email"]?.identifier
        ? `Replies come back to ${f.own["email"]?.identifier}+…@in.groundwork.ke.`
        : "Replies come back to the campaign's own address once it is set up.",
      state: email[0],
      label: email[1],
    },
    {
      code: "FB",
      cls: "ch--fb",
      name: `Messenger${at(f.accounts["facebook"])}`,
      note: "Page messages and comments.",
      state: fb[0],
      label: fb[1],
    },
    {
      code: "IG",
      cls: "ch--ig",
      name: `Instagram DMs${at(f.accounts["instagram"])}`,
      note: "The account linked to the Facebook Page.",
      state: ig[0],
      label: ig[1],
    },
    {
      code: "X",
      cls: "ch--x",
      name: `X DMs & mentions${at(f.accounts["x"])}`,
      note: "Needs a paid X API tier.",
      state: x[0],
      label: x[1],
    },
    {
      code: "TT",
      cls: "ch--tt",
      name: "TikTok",
      note: "No messaging API. Comments come in through listening.",
      state: "amber",
      label: "Listening only",
    },
    {
      code: "WA",
      cls: "ch--wa",
      name: "WhatsApp",
      note: "Meta restricts political use of its API; check eligibility before going live.",
      state: wa[0],
      label: wa[1],
    },
  ];
}
