// WhatsApp templates approved by Meta for the campaign number. Browser-safe.
// {{1}} is always the person's first name and {{2}} the campaign; the rest
// are filled in by whoever sends. Picture versions send an image header above
// the same approved wording.

export type WaTemplate = {
  name: string;
  label: string;
  language: string;
  text: string;
  /** Fields for {{3}}, {{4}}… in order. */
  fields: { label: string; placeholder: string }[];
  /** Meta approved this template with an image header; a picture link is required. */
  image?: boolean;
};

export const WA_TEMPLATES: WaTemplate[] = [
  {
    name: "rally_invitation_v2",
    label: "Rally / community meeting",
    language: "en_US",
    text: "Hello {{1}}, you are warmly invited to a community meeting with {{2}} on {{3}} at {{4}}. The team will share the campaign's plans for your area and, just as importantly, listen to what you want done. Entry is free and everyone from the neighbourhood is welcome, so feel free to bring a friend. Reply STOP at any time to stop receiving messages from us.",
    fields: [
      { label: "Date and time", placeholder: "Saturday 11 October, 2pm" },
      { label: "Venue", placeholder: "Kamukunji Grounds" },
    ],
  },
  {
    name: "poll_invitation_v2",
    label: "Poll invitation",
    language: "en_US",
    text: "Hello {{1}}, the {{2}} campaign would value your views. We are running a short poll on the issues that matter most in your area, and it takes less than a minute to answer. Tap here to take part: {{3}}. Your answer is private and helps shape the campaign's priorities. Reply STOP at any time to stop receiving messages from us.",
    fields: [{ label: "Poll link", placeholder: "https://groundwork.ke/p/ABC123" }],
  },
  {
    name: "volunteer_followup_v2",
    label: "Volunteer thank-you",
    language: "en_US",
    text: "Hello {{1}}, thank you for signing up as a volunteer with the {{2}} campaign — we are glad to have you on the team. Your local organiser {{3}} will be in touch shortly to introduce themselves and agree on how you would like to help, whether that is door-to-door visits, phone calls or helping on election day. Reply STOP at any time to stop receiving messages from us.",
    fields: [{ label: "Organiser's name", placeholder: "James" }],
  },
  {
    name: "election_day_reminder_v2",
    label: "Election-day reminder",
    language: "en_US",
    text: "Hello {{1}}, a friendly reminder from the {{2}} campaign that election day is {{3}}. Your vote matters, so please plan your day around it: polling stations open early in the morning and queues are usually shortest before midday. If you are unsure where to vote, reply to this message and our team will help you find your polling station. Reply STOP at any time to stop receiving messages from us.",
    fields: [{ label: "Election date", placeholder: "Tuesday 10 August 2027" }],
  },
];

export const WA_TEMPLATES_IMG: WaTemplate[] = [
  {
    name: "rally_invitation_img",
    label: "Rally / community meeting · with picture",
    language: "en",
    image: true,
    text: WA_TEMPLATES[0]!.text,
    fields: WA_TEMPLATES[0]!.fields,
  },
  {
    name: "poll_invitation_img",
    label: "Poll invitation · with picture",
    language: "en",
    image: true,
    text: WA_TEMPLATES[1]!.text,
    fields: WA_TEMPLATES[1]!.fields,
  },
];

export const WA_TEMPLATES_ALL: WaTemplate[] = [...WA_TEMPLATES, ...WA_TEMPLATES_IMG];

export function fillTemplate(text: string, params: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] || m);
}

export function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "friend";
}
