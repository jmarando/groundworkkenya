import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getInbox } from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: Inbox,
  head: () => ({
    meta: [
      { title: "Inbox · Groundwork" },
      {
        name: "description",
        content: "Every inbound message in one queue, tagged by ward and issue, routed to a desk.",
      },
      { property: "og:title", content: "Inbox · Groundwork" },
      {
        property: "og:description",
        content: "Every inbound message in one queue, tagged by ward and issue, routed to a desk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const CONNECTIONS = [
  { code: "SMS", cls: "ch--sms", name: "SMS · sender ID", note: "Two-way on a shortcode. The workhorse.", state: "ok" },
  { code: "US", cls: "ch--us", name: "USSD *xyz#", note: "Feature phones. Polls, sign-ups and call-me-back requests.", state: "ok" },
  { code: "EM", cls: "ch--em", name: "Email", note: "Any IMAP mailbox. Threads keep their history.", state: "ok" },
  { code: "FB", cls: "ch--fb", name: "Messenger", note: "Page inbox via Meta Graph API. 24-hour reply window.", state: "ok" },
  { code: "IG", cls: "ch--ig", name: "Instagram DMs", note: "Business account via the same Meta app.", state: "ok" },
  { code: "X", cls: "ch--x", name: "X DMs & mentions", note: "Needs a paid X API tier.", state: "amber" },
  { code: "TT", cls: "ch--tt", name: "TikTok", note: "No DM API. Comments come in through listening.", state: "amber" },
  { code: "WA", cls: "ch--wa", name: "WhatsApp", note: "Meta bars political campaigns from the API. Handsets run by people.", state: "red" },
];

function Inbox() {
  const fetchInbox = useServerFn(getInbox);
  const { data } = useQuery({ queryKey: ["inbox"], queryFn: () => fetchInbox() });

  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => {
    const convos = data?.conversations ?? [];
    return convos.filter((c) => {
      if (filter === "unread" && !c.unread) return false;
      if (filter === "open" && c.status !== "open") return false;
      if (filter !== "all" && filter !== "unread" && filter !== "open" && !c.tags.includes(filter))
        return false;
      if (!q.trim()) return true;
      const n = q.toLowerCase();
      return (
        c.name.toLowerCase().includes(n) ||
        (c.subject ?? "").toLowerCase().includes(n) ||
        (c.snippet ?? "").toLowerCase().includes(n) ||
        (c.ward ?? "").toLowerCase().includes(n)
      );
    });
  }, [data, filter, q]);

  if (!data) {
    return (
      <section className="view active" aria-label="Inbox">
        <div className="vh">
          <div>
            <span className="eyebrow">Comms · one inbox</span>
            <h1>
              Every message, <span className="serif">answered.</span>
            </h1>
            <p className="meta">Loading the queue…</p>
          </div>
        </div>
      </section>
    );
  }

  const open = list.find((c) => c.id === openId) ?? list[0] ?? null;

  return (
    <section className="view active" aria-label="Inbox">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Comms · one inbox</span>
          <h1>
            Every message, <span className="serif">answered.</span>
          </h1>
          <p className="meta">
            {data.counts.all} conversations · {data.counts.unread} unread · {data.counts.open} open
          </p>
        </div>
      </div>

      <div className="ibx fx2">
        <div className="ibx-rail">
          <button
            type="button"
            className={`ibx-f${filter === "all" ? " on" : ""}`}
            onClick={() => setFilter("all")}
          >
            All <b>{data.counts.all}</b>
          </button>
          <button
            type="button"
            className={`ibx-f${filter === "unread" ? " on" : ""}`}
            onClick={() => setFilter("unread")}
          >
            Unread <b>{data.counts.unread}</b>
          </button>
          <button
            type="button"
            className={`ibx-f${filter === "open" ? " on" : ""}`}
            onClick={() => setFilter("open")}
          >
            Open <b>{data.counts.open}</b>
          </button>
          {data.counts.byTag.map((t) => (
            <button
              key={t.tag}
              type="button"
              className={`ibx-f${filter === t.tag ? " on" : ""}`}
              onClick={() => setFilter(t.tag)}
            >
              {t.tag} <b>{t.n}</b>
            </button>
          ))}
        </div>

        <div className="ibx-list">
          <div className="ibx-search">
            <label className="sr" htmlFor="ibxQ">
              Search messages
            </label>
            <input
              id="ibxQ"
              type="search"
              placeholder="Search name, ward, issue"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cv${open?.id === c.id ? " on" : ""}`}
              onClick={() => setOpenId(c.id)}
            >
              <span className="cv-name">
                {c.name}
                {c.unread && <span className="new" aria-label="unread" />}
              </span>
              <span className="cv-when">{stamp(c.lastMessageAt)}</span>
              <span className="cv-snip">{c.subject ?? c.snippet}</span>
              <span className="cv-tags">
                <span className={`ch ch--${c.channel === "sms" ? "sms" : "us"}`}>
                  {c.channel.toUpperCase()}
                </span>
                {c.ward && <span className="tag">{c.ward}</span>}
                {c.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </span>
            </button>
          ))}
          {list.length === 0 && <p className="f-note">Nothing matches that filter.</p>}
        </div>

        <div className="th">
          {open ? (
            <>
              <div className="th-head">
                <div>
                  <span className="th-name">{open.name}</span>
                  <span className="th-meta">
                    {open.phone ?? "no number"} · {open.ward ?? "ward unknown"} ·{" "}
                    {open.channel.toUpperCase()}
                  </span>
                </div>
                <span className="pill pill--ok">
                  <span className="g" aria-hidden="true">
                    ●
                  </span>{" "}
                  {open.status}
                </span>
              </div>
              <div className="th-body">
                {open.snippet && <div className="msg msg--in">{open.snippet}</div>}
                {open.thread.map((m) => (
                  <div key={m.id} className={`msg ${m.direction === "out" ? "msg--out" : "msg--in"}`}>
                    {m.body}
                    <span className="msgd">
                      {stamp(m.at)} · {m.status}
                    </span>
                  </div>
                ))}
                {open.thread.length === 0 && (
                  <div className="msg msg--note">
                    No message history on this record yet — only the conversation summary.
                  </div>
                )}
              </div>
              <div className="th-compose">
                <input placeholder={`Reply to ${open.name} by ${open.channel.toUpperCase()}`} />
                <button className="btn btn--primary btn--sm">Send</button>
              </div>
            </>
          ) : (
            <p className="f-note">Pick a conversation.</p>
          )}
        </div>
      </div>

      <div className="fd-section fx3" style={{ marginTop: 22 }}>
        <span className="eyebrow">Channel connections · what each platform allows a campaign</span>
        <div className="conn">
          {CONNECTIONS.map((c) => (
            <div className="conn-item" key={c.code}>
              <span className={`ch ${c.cls}`}>{c.code}</span>
              <b>{c.name}</b>
              <p>{c.note}</p>
              {c.state === "ok" && (
                <span className="pill pill--ok">
                  <span className="g" aria-hidden="true">
                    ●
                  </span>{" "}
                  Ready
                </span>
              )}
              {c.state === "amber" && (
                <span className="pill pill--amber">
                  <span className="g" aria-hidden="true">
                    ◐
                  </span>{" "}
                  Limited
                </span>
              )}
              {c.state === "red" && (
                <span className="pill pill--outline-red">
                  <span className="g" aria-hidden="true">
                    ▲
                  </span>{" "}
                  No API for campaigns
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
