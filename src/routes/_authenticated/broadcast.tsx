import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getBroadcast } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/broadcast")({
  component: Broadcast,
  head: () => ({
    meta: [
      { title: "Broadcast · Groundwork" },
      {
        name: "description",
        content: "Build the audience once, then send by SMS, email and USSD with ward targeting.",
      },
      { property: "og:title", content: "Broadcast · Groundwork" },
      {
        property: "og:description",
        content: "Build the audience once, then send by SMS, email and USSD with ward targeting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

const PAID = [
  { code: "M", cls: "ch--fb", name: "Meta · FB + IG", note: "Election ads need page authorisation and a \"Paid for by\" disclaimer." },
  { code: "G", cls: "ch--gg", name: "Google Search + Display", note: "Election ads need advertiser verification for Kenya." },
  { code: "YT", cls: "ch--yt", name: "YouTube", note: "Same verification as Google. Cut long video to 15s bumpers." },
  { code: "TT", cls: "ch--tt", name: "TikTok", note: "Bans paid political ads. Contracted, disclosed creators instead." },
];

function Broadcast() {
  const fetchBroadcast = useServerFn(getBroadcast);
  const { data } = useQuery({ queryKey: ["broadcast"], queryFn: () => fetchBroadcast() });

  const [support45, setSupport45] = useState(true);
  const [undecided, setUndecided] = useState(true);
  const [segs, setSegs] = useState<string[]>([]);
  const [ward, setWard] = useState<string>("");
  const [lang, setLang] = useState<"sw" | "en">("sw");

  const contacts = data?.contacts ?? [];
  const matched = useMemo(
    () =>
      contacts.filter((c) => {
        if (ward && c.wardId !== ward) return false;
        if (segs.length && !(c.segment && segs.includes(c.segment))) return false;
        if (support45 || undecided) {
          const strong = c.support >= 70;
          const mid = c.support >= 40 && c.support < 70;
          if (!((support45 && strong) || (undecided && mid))) return false;
        }
        return true;
      }),
    [contacts, ward, segs, support45, undecided],
  );
  const reachable = useMemo(
    () => matched.filter((c) => c.sms && !c.optedOut),
    [matched],
  );
  const toggleSeg = (slug: string) =>
    setSegs((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));


  if (!data) {
    return (
      <section className="view active" aria-label="Broadcast">
        <div className="vh">
          <div>
            <span className="eyebrow">Comms · broadcast &amp; paid media</span>
            <h1>
              One message, <span className="serif">the right doors.</span>
            </h1>
            <p className="meta">Loading audience…</p>
          </div>
        </div>
      </section>
    );
  }

  const a = data.audience;
  const reach = matched.length;
  const sendable = reachable.length;
  const cost = sendable * data.smsRate;
  const wardName = data.wardList.find((w) => w.id === ward)?.name ?? null;
  const segNames = data.segments.filter((s) => segs.includes(s.slug)).map((s) => s.name);

  const body = wardName
    ? lang === "sw"
      ? `Habari. Tuko ${wardName} Jumamosi saa kumi jioni kwa mkutano wa mtaa. Karibu tuongee kuhusu mipango yetu. Jibu NDIYO kuthibitisha. Bure. STOP kujiondoa.`
      : `Hello. We are in ${wardName} this Saturday at 4pm for a ward rally. Come and hear the plan. Reply YES to confirm. Free. STOP to opt out.`
    : lang === "sw"
      ? "Habari. Tunakuletea ratiba mpya ya kuchukua taka mtaani kwako wiki hii. Jibu NDIYO kupokea ukumbusho. Bure. STOP kujiondoa."
      : "Hello. Here is this week's rubbish collection schedule for your estate. Reply YES for reminders. Free. STOP to opt out.";

  const exportAudience = () =>
    downloadCSV(
      stampName(`groundwork-audience${wardName ? `-${wardName.toLowerCase().replace(/\s+/g, "-")}` : ""}`),
      [
        "Name",
        "Phone",
        "Ward",
        "Constituency",
        "Segment",
        "Support score",
        "Language",
        "SMS consent",
        "WhatsApp consent",
        "Call consent",
        "Opted out",
        "Last contacted",
      ],
      matched.map((c) => [
        c.name,
        c.phone,
        c.ward ?? "",
        c.constituency ?? "",
        c.segment ?? "",
        c.support,
        c.language,
        c.sms ? "yes" : "no",
        c.whatsapp ? "yes" : "no",
        c.call ? "yes" : "no",
        c.optedOut ? "yes" : "no",
        c.lastTouch ? c.lastTouch.slice(0, 10) : "",
      ]),
    );

  return (
    <section className="view active" aria-label="Broadcast">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Comms · broadcast &amp; paid media</span>
          <h1>
            One message, <span className="serif">the right doors.</span>
          </h1>
          <p className="meta">
            Build the audience once. Send by SMS and USSD; buy the rest with the same ward
            targeting.
          </p>
        </div>
        <div className="vh-side">
          <button className="btn btn--primary" type="button">
            Schedule send
          </button>
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(a.sms)} consented for SMS
          </span>
        </div>
      </div>

      <div className="g2 fx2">
        <div className="card">
          <div className="card-head">
            <h2>Audience</h2>
            <span className="mono">{nf.format(sendable)} people</span>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div>
              <span className="kpi-lbl">Who</span>
              <div className="fchips" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="fchip"
                  aria-pressed={support45}
                  onClick={() => setSupport45((v) => !v)}
                >
                  Strong support 70+ · {nf.format(a.support45)}
                </button>
                <button
                  type="button"
                  className="fchip"
                  aria-pressed={undecided}
                  onClick={() => setUndecided((v) => !v)}
                >
                  Persuadable 40–69 · {nf.format(a.undecided)}
                </button>
              </div>
            </div>
            <div>
              <span className="kpi-lbl">Where · top consented wards</span>
              <div className="fchips" style={{ marginTop: 6 }}>
                {data.wards.map((w) => (
                  <span className="fchip" key={w.name}>
                    {w.name} · {nf.format(w.consented)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="funnel" style={{ marginTop: 16 }}>
            <div className="funnel-row">
              <span>People on file</span>
              <b className="stat">{nf.format(a.total)}</b>
            </div>
            <div className="funnel-row">
              <span>Matching the filters</span>
              <b className="stat">{nf.format(reach)}</b>
            </div>
            <div className="funnel-row">
              <span>Consented for SMS</span>
              <b className="stat">{nf.format(sendable)}</b>
            </div>
            <div className="funnel-row">
              <span>Opted out · excluded</span>
              <b className="stat">{nf.format(a.optedOut)}</b>
            </div>
          </div>
          <p className="f-note">
            Consent is checked per person, per channel, per purpose. Anyone outside it drops out of
            the send.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Message</h2>
            <div className="seg" role="group" aria-label="Language">
              <button type="button" aria-pressed={lang === "sw"} onClick={() => setLang("sw")}>
                Kiswahili
              </button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
                English
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div className="preview-phone" style={{ flex: 1, minWidth: 220 }}>
              <div className="from">SMS · GROUNDWORK · 1 of 1 · {body.length} chars</div>
              <div className="bubble">{body}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="f-rows" style={{ marginTop: 0 }}>
                <div className="f-row">
                  <span>SMS · consented</span>
                  <b className="stat">{nf.format(a.sms)}</b>
                </div>
                <div className="f-row">
                  <span>WhatsApp · consented</span>
                  <b className="stat">{nf.format(a.whatsapp)}</b>
                </div>
                <div className="f-row">
                  <span>Calls · consented</span>
                  <b className="stat">{nf.format(a.call)}</b>
                </div>
                <div className="f-row">
                  <span>Est. cost · SMS at KES {data.smsRate.toFixed(2)}</span>
                  <b className="stat">KES {nf.format(Math.round(cost))}</b>
                </div>
                <div className="f-row">
                  <span>Opt-out line</span>
                  <span className="mono">STOP to 22xxx</span>
                </div>
              </div>
              <p className="f-note">Every send posts to Finance as comms, with its receipt.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card fx3" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>Paid media · same audience, bought</h2>
          <span className="mono">ward-level geo · disclosed sponsor</span>
        </div>
        <div className="g4">
          {PAID.map((p) => (
            <div className="conn-item" key={p.code}>
              <span className={`ch ${p.cls}`}>{p.code}</span>
              <b>{p.name}</b>
              <p>{p.note}</p>
              <span className="pill pill--amber">
                <span className="g" aria-hidden="true">
                  ◐
                </span>{" "}
                Verify before launch
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card fx4" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>Campaigns sent</h2>
          <span className="mono">from the live message log</span>
        </div>
        <div className="tblwrap">
          <table className="tbl camp-tbl">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Channel</th>
                <th style={{ textAlign: "right" }}>Sent</th>
                <th style={{ textAlign: "right" }}>Delivered</th>
                <th style={{ textAlign: "right" }}>Failed</th>
                <th style={{ textAlign: "right" }}>Cost · KES</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.key}>
                  <td>{c.body.slice(0, 72)}…</td>
                  <td>
                    <span className="ch ch--sms">{c.channel.toUpperCase()}</span>
                  </td>
                  <td className="num">{nf.format(c.sent)}</td>
                  <td className="num">{nf.format(c.delivered)}</td>
                  <td className="num">{c.failed ? nf.format(c.failed) : "—"}</td>
                  <td className="num">{nf.format(Math.round(c.cost))}</td>
                  <td className="meta">{stamp(c.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
