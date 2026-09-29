import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy · Groundwork" },
      {
        name: "description",
        content:
          "How Groundwork collects, uses and protects personal data across its campaign platform, including Facebook, Instagram and WhatsApp integrations.",
      },
      { property: "og:title", content: "Privacy policy · Groundwork" },
      {
        property: "og:description",
        content:
          "How Groundwork collects, uses and protects personal data across its campaign platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "Who we are",
    body: [
      "Groundwork (groundwork.ke) is a campaign operations platform used by political campaign teams in Kenya to manage voter contact, field canvassing, communications, polling and election-day coordination.",
      "Each campaign using Groundwork is the data controller for the people in its own workspace. Groundwork acts as the platform provider.",
    ],
  },
  {
    title: "What we collect",
    body: [
      "Contact details you give us or give a campaign: name, phone number, email address, ward and constituency, and how you prefer to be contacted.",
      "Messages you send to a campaign — by SMS, WhatsApp, Facebook, Instagram or web forms — including the content of those messages and when they were sent.",
      "Public social media posts and comments that mention topics a campaign is monitoring, along with the public profile name of the author.",
      "Staff and volunteer accounts: name, email, role and activity inside the platform.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To let campaign teams respond to messages, organise volunteers, plan field visits, run polls and send campaign updates to people who have agreed to receive them.",
      "To analyse sentiment and issues across messages and public posts so campaigns can understand what people care about.",
      "We do not sell personal data, and we do not use it for advertising.",
    ],
  },
  {
    title: "Facebook, Instagram and WhatsApp data",
    body: [
      "When you message a campaign's Facebook Page, Instagram account or WhatsApp number, we receive the message content, your public profile name and platform identifiers through Meta's APIs, solely so the campaign team can read and reply to you from one inbox.",
      "We use Meta platform data only for the features described above, we do not share it with third parties, and we delete it when it is no longer needed or when you ask us to.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can opt out of SMS or WhatsApp messages at any time by replying STOP or ACHA. Opt-outs are applied immediately.",
      "You can ask a campaign to correct or delete your information by contacting them directly, or by emailing justin@glab.africa.",
    ],
  },
  {
    title: "Storage and security",
    body: [
      "Data is stored on encrypted cloud infrastructure with row-level access controls. Each campaign can only see its own data, and staff only see the parts of the platform their role allows.",
      "We keep data for the life of the campaign and delete or anonymise it afterwards unless the law requires otherwise.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Questions about this policy or your data: justin@glab.africa.",
      "This policy was last updated on 29 September 2026.",
    ],
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#141C19] text-[#F5F5F0]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D9481C]">
          Groundwork
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Privacy policy</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#F5F5F0]/70">
          This policy explains what information Groundwork and the campaigns that use
          it collect, and what we do with it.
        </p>
        <div className="mt-12 space-y-10">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-[#F5F5F0]/75">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
