import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { BroadcastComposer } from "@/components/gw/BroadcastComposer";
import { Creators } from "@/components/gw/broadcast/Creators";
import { AutoCalls } from "@/components/gw/broadcast/AutoCalls";
import { PaidMedia } from "@/components/gw/broadcast/PaidMedia";
import { useAccess } from "@/hooks/useAccess";
import type { BroadcastAudience, SupportBand } from "@/lib/broadcast.functions";
import { getBroadcast } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";
import { parseBroadcastSearch, type BroadcastSearch } from "@/lib/voters-view";
import { nf, shortDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/broadcast")({
  component: Broadcast,
  // ?wards=a,b&support=strong: the audience Voters chose ("Message these people").
  validateSearch: (search: Record<string, unknown>): BroadcastSearch & { tab?: Tab } => ({
    ...(TABS.some((t) => t.key === search["tab"]) ? { tab: search["tab"] as Tab } : {}),
    ...(typeof search["wards"] === "string" ? { wards: search["wards"] } : {}),
    ...(search["support"] === "strong" ||
    search["support"] === "persuadable" ||
    search["support"] === "both"
      ? { support: search["support"] }
      : {}),
  }),
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

const stamp = shortDay;

const TABS = [
  { key: "send", label: "Message people" },
  { key: "calls", label: "Auto-calls" },
  { key: "ads", label: "Paid ads" },
  { key: "creators", label: "Creators" },
  { key: "sent", label: "Sent" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function Broadcast() {
  const fetchBroadcast = useServerFn(getBroadcast);
  const { data, isError, refetch } = useQuery({
    queryKey: ["broadcast"],
    queryFn: () => fetchBroadcast(),
  });

  const start = parseBroadcastSearch(Route.useSearch());
  const [support45, setSupport45] = useState(start.strong);
  const [undecided, setUndecided] = useState(start.persuadable);
  const [segs, setSegs] = useState<string[]>([]);
  const [wardIds, setWardIds] = useState<string[]>(start.wardIds);
  /** One ward: rally mode, addressed to it. */
  const ward = wardIds.length === 1 ? wardIds[0]! : "";
  const [lang, setLang] = useState<"sw" | "en">("sw");
  const [composing, setComposing] = useState<null | "sms" | "wa">(null);
  const { tab = "send" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setTab = (t: Tab) =>
    void navigate({
      search: (s: BroadcastSearch & { tab?: Tab }) => ({ ...s, tab: t }),
      replace: true,
    });
  const { isPrincipal } = useAccess();

  const contacts = data?.contacts ?? [];
  const matched = useMemo(
    () =>
      contacts.filter((c) => {
        if (wardIds.length && !(c.wardId && wardIds.includes(c.wardId))) return false;
        if (segs.length && !(c.segment && segs.includes(c.segment))) return false;
        if (support45 || undecided) {
          const strong = c.support >= 70;
          const mid = c.support >= 40 && c.support < 70;
          if (!((support45 && strong) || (undecided && mid))) return false;
        }
        return true;
      }),
    [contacts, wardIds, segs, support45, undecided],
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
            {isError ? (
              <p className="meta" role="alert">
                Couldn&apos;t load the audience.{" "}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void refetch()}
                >
                  Try again
                </button>
              </p>
            ) : (
              <p className="meta">Loading audience…</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const a = data.audience;
  const reach = matched.length;
  const wardName = data.wardList.find((w) => w.id === ward)?.name ?? null;
  const place = wardName ?? (wardIds.length > 1 ? `${wardIds.length} wards` : null);
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
      stampName(
        `groundwork-audience${wardName ? `-${wardName.toLowerCase().replace(/\s+/g, "-")}` : ""}`,
      ),
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

  const audience: BroadcastAudience = {
    wardIds,
    segments: segs,
    support: [
      ...(support45 ? (["strong"] as SupportBand[]) : []),
      ...(undecided ? (["undecided"] as SupportBand[]) : []),
    ],
  };
  const describe = [
    segNames.length ? segNames.join(", ") : "Everyone",
    place ? `in ${place}` : "in every ward",
    support45 && undecided
      ? "· strong and undecided supporters"
      : support45
        ? "· strong supporters"
        : undecided
          ? "· undecided"
          : "",
  ]
    .filter(Boolean)
    .join(" ");
  const live = matched.filter((c) => !c.optedOut && !c.sample);
  const samples = matched.filter((c) => c.sample).length;
  const byChannel = {
    sms: live.filter((c) => c.sms).length,
    wa: live.filter((c) => c.whatsapp).length,
    call: live.filter((c) => c.call).length,
  };

  return (
    <section className="view active bc-page" aria-label="Broadcast">
      {composing && (
        <BroadcastComposer
          audience={audience}
          describe={describe}
          initialBody={body}
          smsRate={data.smsRate}
          initialChannel={composing}
          onClose={() => setComposing(null)}
        />
      )}
      <div className="vh fx">
        <div>
          <span className="eyebrow">Comms · broadcast &amp; ads</span>
          <h1>
            One message, <span className="serif">the right doors.</span>
          </h1>
          <p className="meta">
            Choose who, then how: SMS, an approved WhatsApp message, or an auto-call in the
            candidate&apos;s voice. Only people who agreed to that channel are reached.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(a.sms)} SMS ·{" "}
            {nf.format(a.whatsapp)} WhatsApp · {nf.format(a.call)} calls agreed
          </span>
        </div>
      </div>

      <div className="bc-tabbar" role="tablist" aria-label="Broadcast">
        {TABS.map((t) => (
          <button
            type="button"
            role="tab"
            key={t.key}
            aria-selected={tab === t.key}
            className={`bc-tab${tab === t.key ? " is-on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "send" || tab === "calls") && (
        <div className="card bc-who">
          <div className="card-head">
            <div>
              <h2>Who</h2>
              <p className="meta">{describe}</p>
            </div>
            <span className="mono">{nf.format(reach)} people match</span>
          </div>
          <div className="bc-filters">
            <div>
              <span className="kpi-lbl">Support</span>
              <div className="fchips" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="fchip"
                  aria-pressed={support45}
                  onClick={() => setSupport45((v) => !v)}
                >
                  Strong 70+ · {nf.format(a.support45)}
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
              <span className="kpi-lbl">Groups</span>
              <div className="fchips" style={{ marginTop: 6 }}>
                {data.segments.map((s) => {
                  const count = contacts.filter((c) => c.segment === s.slug).length;
                  return (
                    <button
                      type="button"
                      className="fchip"
                      key={s.slug}
                      aria-pressed={segs.includes(s.slug)}
                      onClick={() => toggleSeg(s.slug)}
                    >
                      {s.name} · {nf.format(count)}
                    </button>
                  );
                })}
                {segs.length ? (
                  <button type="button" className="fchip" onClick={() => setSegs([])}>
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <span className="kpi-lbl">Where</span>
              <div className="pbar" style={{ marginTop: 6 }}>
                <select
                  value={wardIds.length > 1 ? "many" : ward}
                  onChange={(e) =>
                    setWardIds(e.target.value && e.target.value !== "many" ? [e.target.value] : [])
                  }
                  aria-label="Ward"
                >
                  <option value="">Every ward</option>
                  {wardIds.length > 1 ? (
                    <option value="many">These {wardIds.length} wards, from Voters</option>
                  ) : null}
                  {data.wardList.map((w) => (
                    <option value={w.id} key={w.id}>
                      {w.name} · {w.constituency}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="bc-foot">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={exportAudience}
              disabled={!reach}
            >
              Download this list · CSV
            </button>
            <span className="f-note">
              {nf.format(matched.filter((c) => c.optedOut).length)} opted out, left out of every
              send.
              {samples
                ? ` ${nf.format(samples)} sample contacts are shown but never messaged or called.`
                : ""}
            </span>
          </div>
        </div>
      )}

      {tab === "send" && (
        <div className="bc-channels">
          <article className="card bc-channel">
            <span className="eyebrow">SMS</span>
            <b className="stat">{nf.format(byChannel.sms)}</b>
            <p className="meta">
              agreed to SMS · about KES {nf.format(Math.round(byChannel.sms * data.smsRate))} for
              one text
            </p>
            <div className="seg" role="group" aria-label="Starting text">
              <button type="button" aria-pressed={lang === "sw"} onClick={() => setLang("sw")}>
                Kiswahili
              </button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
                English
              </button>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!isPrincipal || byChannel.sms === 0}
              onClick={() => setComposing("sms")}
            >
              Write an SMS
            </button>
          </article>
          <article className="card bc-channel">
            <span className="eyebrow">WhatsApp</span>
            <b className="stat">{nf.format(byChannel.wa)}</b>
            <p className="meta">
              agreed to WhatsApp · Meta-approved messages, with a picture if you like
            </p>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!isPrincipal || byChannel.wa === 0}
              onClick={() => setComposing("wa")}
            >
              Choose a WhatsApp message
            </button>
          </article>
          <article className="card bc-channel">
            <span className="eyebrow">Auto-call</span>
            <b className="stat">{nf.format(byChannel.call)}</b>
            <p className="meta">
              agreed to calls · a recorded message in the candidate&apos;s voice
            </p>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={byChannel.call === 0}
              onClick={() => setTab("calls")}
            >
              Make an auto-call
            </button>
          </article>
          {!isPrincipal && (
            <p className="f-note">Only the candidate and managers send to an audience.</p>
          )}
        </div>
      )}

      {tab === "calls" && <AutoCalls audience={audience} describe={describe} />}
      {tab === "ads" && <PaidMedia wards={data.wardList} canBook={isPrincipal} />}
      {tab === "creators" && <Creators canBrief={isPrincipal} />}

      {tab === "sent" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2>Sent</h2>
            <span className="mono">from the message log</span>
          </div>
          {data.campaigns.length === 0 ? (
            <p className="f-note">Nothing sent yet.</p>
          ) : (
            <div className="tblwrap">
              <table className="tbl camp-tbl">
                <thead>
                  <tr>
                    <th>Message</th>
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
                        <span className={`ch ch--${c.channel === "whatsapp" ? "wa" : "sms"}`}>
                          {c.channel === "whatsapp" ? "WhatsApp" : c.channel.toUpperCase()}
                        </span>
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
          )}
          <p className="f-note">
            Auto-calls are listed under Auto-calls, with every call&apos;s outcome.
          </p>
        </div>
      )}
    </section>
  );
}
