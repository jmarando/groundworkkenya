import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Check, MessageCircle, Phone, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CallProgress, rememberedPhone, rememberPhone } from "@/components/gw/CallProgress";
import { Channels } from "@/components/gw/inbox/Channels";
import { WhatsAppTemplateFields } from "@/components/gw/WhatsAppTemplateFields";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useAccess";
import { getInbox } from "@/lib/console.functions";
import { stamp } from "@/lib/format";
import { byPerson, statusWords, whatsappWindowOpen, type PersonRow } from "@/lib/inbox-people";
import {
  markConversations,
  replyToConversation,
  searchPeopleForMessage,
  startConversation,
} from "@/lib/social.functions";
import { callFromInbox, callSetup } from "@/lib/voice.functions";
import {
  firstName,
  validateWaTemplate,
  WA_TEMPLATES_ALL,
  type WaTemplateInput,
} from "@/lib/wa-templates";

type Tab = "messages" | "channels";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: Inbox,
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    search["tab"] === "channels" ? { tab: "channels" } : {},
  head: () => ({
    meta: [
      { title: "Inbox · Groundwork" },
      {
        name: "description",
        content:
          "Every message from every channel, one thread per person, answered from one place.",
      },
      { property: "og:title", content: "Inbox · Groundwork" },
      { property: "og:type", content: "website" },
    ],
  }),
});

const PLATFORM_BADGE: Record<string, { code: string; cls: string; name: string }> = {
  sms: { code: "SMS", cls: "ch--sms", name: "SMS" },
  ussd: { code: "US", cls: "ch--us", name: "USSD" },
  email: { code: "EM", cls: "ch--em", name: "Email" },
  facebook: { code: "FB", cls: "ch--fb", name: "Facebook" },
  messenger: { code: "FB", cls: "ch--fb", name: "Facebook" },
  instagram: { code: "IG", cls: "ch--ig", name: "Instagram" },
  x: { code: "X", cls: "ch--x", name: "X" },
  tiktok: { code: "TT", cls: "ch--tt", name: "TikTok" },
  whatsapp: { code: "WA", cls: "ch--wa", name: "WhatsApp" },
};
const badge = (platform: string) =>
  PLATFORM_BADGE[platform] ?? {
    code: platform.slice(0, 3).toUpperCase(),
    cls: "ch--us",
    name: platform,
  };
const MOOD: Record<string, string> = { positive: "warm", neutral: "neutral", negative: "angry" };
const SOCIAL = ["facebook", "messenger", "instagram", "x", "tiktok", "whatsapp"];

type Filter = "all" | "reply" | "unread" | "social" | "angry";

function Inbox() {
  const { campaign } = useAccess();
  const { tab = "messages" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchInbox = useServerFn(getInbox);
  const sendReply = useServerFn(replyToConversation);
  const searchPeople = useServerFn(searchPeopleForMessage);
  const startConvo = useServerFn(startConversation);
  const mark = useServerFn(markConversations);
  const queryClient = useQueryClient();
  const { data, isError, refetch } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => fetchInbox(),
    refetchInterval: 30_000,
  });
  const [sending, setSending] = useState(false);

  // New outbound message
  const [composing, setComposing] = useState(false);
  const [pq, setPq] = useState("");
  const [results, setResults] = useState<
    {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      ward: string | null;
      optedOut: boolean;
      consentSms: boolean;
      consentWhatsapp: boolean;
    }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string; email: string | null } | null>(
    null,
  );
  const [channel, setChannel] = useState<"sms" | "whatsapp" | "email">("sms");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [wa, setWa] = useState<WaTemplateInput>({ template: "rally_invitation_v2", fields: [] });
  let waReady = false;
  try {
    validateWaTemplate(wa);
    waReady = true;
  } catch {
    /* incomplete fields */
  }
  const [newNote, setNewNote] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [topic, setTopic] = useState("");
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const people = useMemo(() => byPerson(data?.conversations ?? []), [data]);
  const counts = useMemo(
    () => ({
      all: people.length,
      reply: people.filter((p) => p.needsReply).length,
      unread: people.filter((p) => p.unread).length,
      social: people.filter((p) => p.platforms.some((x) => SOCIAL.includes(x))).length,
      angry: people.filter((p) => p.sentiment === "negative").length,
    }),
    [people],
  );
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return people.filter((p) => {
      if (filter === "reply" && !p.needsReply) return false;
      if (filter === "unread" && !p.unread) return false;
      if (filter === "social" && !p.platforms.some((x) => SOCIAL.includes(x))) return false;
      if (filter === "angry" && p.sentiment !== "negative") return false;
      if (topic && !p.tags.includes(topic) && p.issue !== topic) return false;
      if (!n) return true;
      return (
        p.name.toLowerCase().includes(n) ||
        (p.phone ?? "").includes(n) ||
        (p.snippet ?? "").toLowerCase().includes(n) ||
        (p.ward ?? "").toLowerCase().includes(n) ||
        (p.issue ?? "").toLowerCase().includes(n)
      );
    });
  }, [people, filter, topic, q]);
  const open = list.find((p) => p.key === openKey) ?? null;

  // Opening someone marks their conversations read.
  useEffect(() => {
    if (!open?.unread) return;
    const ids = open.convos.filter((c) => c.unread).map((c) => c.id);
    void mark({ data: { ids, unread: false } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["inbox"] }),
    );
  }, [open?.key, open?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = (t: Tab) =>
    void navigate({ search: t === "channels" ? { tab: "channels" } : {}, replace: true });

  if (!data) {
    return (
      <section className="view active" aria-label="Inbox">
        <div className="vh">
          <div>
            <span className="eyebrow">Comms · one inbox</span>
            <h1>
              Every message, <span className="serif">answered.</span>
            </h1>
            {isError ? (
              <p className="meta" role="alert">
                Couldn&apos;t load the inbox.{" "}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void refetch()}
                >
                  Try again
                </button>
              </p>
            ) : (
              <p className="meta">Loading…</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  async function findPeople() {
    if (pq.trim().length < 2 || searching) return;
    setSearching(true);
    try {
      setResults(await searchPeople({ data: { q: pq.trim() } }));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function sendNew() {
    if (!picked || (channel === "whatsapp" ? !waReady : !newBody.trim()) || sending) return;
    setSending(true);
    setNewNote(null);
    try {
      const r = await startConvo({
        data: {
          personId: picked.id,
          channel,
          body: newBody.trim(),
          subject: newSubject.trim(),
          ...(channel === "whatsapp" ? { whatsapp: wa } : {}),
        },
      });
      setNewNote(r.note);
      setNewBody("");
      setNewSubject("");
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
      setComposing(false);
      setPicked(null);
      setResults([]);
      setPq("");
      setOpenKey(`p:${picked.id}`);
    } catch (err) {
      setNewNote(err instanceof Error ? err.message : "The message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  /** The New message sheet, opened on a person and channel. */
  function composeTo(p: { id: string; name: string; email: string | null }, ch: typeof channel) {
    setPicked(p);
    setChannel(ch);
    setNewNote(null);
    setComposing(true);
  }

  return (
    <section className="view active" aria-label="Inbox">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Comms · one inbox</span>
          <h1>
            Every message, <span className="serif">answered.</span>
          </h1>
          <p className="meta">
            {counts.all} people · {counts.reply} waiting for a reply · {counts.unread} unread
          </p>
        </div>
        <div className="vh-side">
          <Button
            type="button"
            onClick={() => {
              setPicked(null);
              setComposing(true);
              setNewNote(null);
            }}
          >
            <MessageCircle aria-hidden="true" /> New message
          </Button>
        </div>
      </div>

      <div className="bc-tabbar" role="tablist" aria-label="Inbox">
        {(
          [
            ["messages", "Messages"],
            ["channels", "Channels"],
          ] as const
        ).map(([k, label]) => (
          <button
            type="button"
            role="tab"
            key={k}
            aria-selected={tab === k}
            className={`bc-tab${tab === k ? " is-on" : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {composing && (
        <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="nm-title">
          <div className="pb outreach-sheet">
            <div className="pb-head">
              <div>
                <span className="eyebrow">Inbox · outbound</span>
                <h2 id="nm-title">Start a conversation.</h2>
              </div>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => setComposing(false)}
              >
                Close
              </button>
            </div>
            <div className="pb-body">
              {!picked ? (
                <>
                  <label className="pb-field">
                    <span>Who?</span>
                    <input
                      type="search"
                      placeholder="Search by name, phone or email"
                      value={pq}
                      onChange={(e) => setPq(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void findPeople();
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={searching || pq.trim().length < 2}
                    onClick={() => void findPeople()}
                  >
                    {searching ? "Searching…" : "Search people"}
                  </button>
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="cv"
                      onClick={() => {
                        setPicked({ id: p.id, name: p.name, email: p.email });
                        setChannel(
                          p.consentWhatsapp
                            ? "whatsapp"
                            : p.phone?.startsWith("email:")
                              ? "email"
                              : "sms",
                        );
                      }}
                    >
                      <span className="cv-name">{p.name}</span>
                      <span className="cv-snip">
                        {p.phone?.startsWith("email:") ? "" : `${p.phone ?? "no number"} · `}
                        {p.email ? `${p.email} · ` : ""}
                        {p.ward ?? "ward unknown"}
                        {p.optedOut ? " · opted out" : ""}
                      </span>
                    </button>
                  ))}
                  {results.length === 0 && !searching && pq.trim().length >= 2 && (
                    <p className="f-note">Nobody matches. Add them on the People page first.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="f-note">
                    To <b>{picked.name}</b>{" "}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setPicked(null)}
                    >
                      Change
                    </button>
                  </p>
                  <div className="bc-actions outreach-channels">
                    <button
                      type="button"
                      className={`btn btn--sm ${channel === "sms" ? "btn--primary" : "btn--ghost"}`}
                      onClick={() => setChannel("sms")}
                    >
                      SMS
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${channel === "whatsapp" ? "btn--primary" : "btn--ghost"}`}
                      onClick={() => setChannel("whatsapp")}
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${channel === "email" ? "btn--primary" : "btn--ghost"}`}
                      disabled={!picked.email}
                      title={picked.email ? picked.email : "No email address on this person"}
                      onClick={() => setChannel("email")}
                    >
                      Email
                    </button>
                  </div>
                  {channel === "email" && (
                    <label className="pb-field">
                      <span>Subject</span>
                      <input
                        value={newSubject}
                        maxLength={150}
                        onChange={(e) => setNewSubject(e.target.value)}
                      />
                    </label>
                  )}
                  {channel === "whatsapp" && (
                    <WhatsAppTemplateFields
                      templates={WA_TEMPLATES_ALL}
                      value={wa}
                      onChange={setWa}
                      name={firstName(picked.name)}
                      campaign={campaign?.candidate ?? campaign?.name}
                      disabled={sending}
                    />
                  )}
                  {channel !== "whatsapp" && (
                    <label className="pb-field">
                      <span>Message</span>
                      <textarea
                        rows={4}
                        value={newBody}
                        maxLength={2000}
                        onChange={(e) => setNewBody(e.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="pb-foot">
              <p className="f-note" aria-live="polite">
                {newNote ?? ""}
              </p>
              {picked && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={sending || (channel === "whatsapp" ? !waReady : !newBody.trim())}
                  onClick={() => void sendNew()}
                >
                  {sending
                    ? "Sending…"
                    : `Send by ${channel === "sms" ? "SMS" : channel === "email" ? "email" : "WhatsApp"}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "channels" && <Channels />}

      {tab === "messages" && (
        <div className="ibx2" data-open={open ? "true" : "false"}>
          <div className="ibx2-list">
            <div className="ibx2-tools">
              <label className="sr" htmlFor="ibxQ">
                Search
              </label>
              <input
                id="ibxQ"
                type="search"
                placeholder="Search name, number, ward, issue"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="fchips">
                {(
                  [
                    ["all", "All"],
                    ["reply", "Needs reply"],
                    ["unread", "Unread"],
                    ["social", "Social"],
                    ["angry", "Angry"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    type="button"
                    key={k}
                    className="fchip"
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                  >
                    {label} · {counts[k]}
                  </button>
                ))}
              </div>
              {data.counts.byTag.length > 0 && (
                <select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                  <option value="">Every topic</option>
                  {[...data.counts.byTag]
                    .sort((a, b) => a.tag.localeCompare(b.tag))
                    .map((t) => (
                      <option key={t.tag} value={t.tag}>
                        {t.tag} ({t.n})
                      </option>
                    ))}
                </select>
              )}
            </div>
            <div className="ibx2-rows">
              {list.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`cv2${p.unread ? " is-unread" : ""}`}
                  aria-current={open?.key === p.key ? "true" : undefined}
                  onClick={() => setOpenKey(p.key)}
                >
                  <span className="cv2-top">
                    <b>{p.name}</b>
                    <span className="mono">{stamp(p.lastAt)}</span>
                  </span>
                  <span className="cv2-snip">{p.snippet ?? ""}</span>
                  <span className="cv2-tags">
                    {p.platforms.map((x) => (
                      <span key={x} className={`ch ${badge(x).cls}`}>
                        {badge(x).code}
                      </span>
                    ))}
                    {p.needsReply && <span className="pill pill--amber">needs reply</span>}
                    {p.sentiment === "negative" && <span className="tag">angry</span>}
                    {p.issue && <span className="tag">{p.issue}</span>}
                    {p.ward && <span className="tag">{p.ward}</span>}
                  </span>
                </button>
              ))}
              {list.length === 0 && <p className="f-note">Nobody matches.</p>}
            </div>
          </div>

          <div className="ibx2-thread">
            {open ? (
              <Thread
                key={open.key}
                row={open}
                busy={sending}
                onBack={() => setOpenKey(null)}
                onReply={async (conversationId, body) => {
                  setSending(true);
                  try {
                    const res = await sendReply({ data: { conversationId, body } });
                    await queryClient.invalidateQueries({ queryKey: ["inbox"] });
                    return res.note;
                  } finally {
                    setSending(false);
                  }
                }}
                onMark={async (status) => {
                  await mark({ data: { ids: open.convos.map((c) => c.id), status } });
                  await queryClient.invalidateQueries({ queryKey: ["inbox"] });
                }}
                onTemplate={() =>
                  open.personId &&
                  composeTo({ id: open.personId, name: open.name, email: null }, "whatsapp")
                }
              />
            ) : (
              <div className="ibx2-empty">
                <p>Choose someone on the left to read and answer their messages.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Thread({
  row,
  busy,
  onBack,
  onReply,
  onMark,
  onTemplate,
}: {
  row: PersonRow;
  busy: boolean;
  onBack: () => void;
  onReply: (conversationId: string, body: string) => Promise<string>;
  onMark: (status: "open" | "closed") => Promise<void>;
  onTemplate: () => void;
}) {
  const [via, setVia] = useState(row.convos[0]!.id);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const target = row.convos.find((c) => c.id === via) ?? row.convos[0]!;
  const waShut = target.platform === "whatsapp" && !whatsappWindowOpen(row);
  const isOpen = row.convos.some((c) => c.status === "open");

  async function send() {
    if (!draft.trim() || busy) return;
    setNote(null);
    try {
      setNote(await onReply(target.id, draft.trim()));
      setDraft("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The reply could not be sent.");
    }
  }

  return (
    <div className="th2">
      <div className="th2-head">
        <button type="button" className="btn btn--ghost btn--sm th2-back" onClick={onBack}>
          ← All
        </button>
        <div className="th2-who">
          <b>{row.name}</b>
          <span className="meta">
            {[row.phone, row.ward].filter(Boolean).join(" · ") || "no number on file"}
          </span>
        </div>
        <div className="th2-actions">
          {row.phone && (
            <Button size="sm" variant="outline" onClick={() => setCalling((v) => !v)}>
              <Phone aria-hidden="true" /> Call
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/polling">
              <BarChart3 aria-hidden="true" /> Poll
            </Link>
          </Button>
          {isOpen ? (
            <Button size="sm" variant="outline" onClick={() => void onMark("closed")}>
              <Check aria-hidden="true" /> Done
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void onMark("open")}>
              <RotateCcw aria-hidden="true" /> Reopen
            </Button>
          )}
        </div>
      </div>

      {calling && row.phone && <CallBox conversationId={target.id} />}

      <div className="th2-body">
        {row.thread.map((m) => (
          <div key={m.id} className={`msg ${m.direction === "out" ? "msg--out" : "msg--in"}`}>
            <div className="msg-text">{m.body}</div>
            <small className="msg-meta">
              <span className={`ch ${badge(m.platform).cls}`}>{badge(m.platform).code}</span>
              <time dateTime={m.at}>{stamp(m.at)}</time>
              {statusWords(m) && (
                <span className={`msg-status${m.status === "failed" ? " is-bad" : ""}`}>
                  {statusWords(m)}
                </span>
              )}
            </small>
          </div>
        ))}
        {row.thread.length === 0 && (
          <div className="msg msg--note">{row.snippet ?? "No messages on record yet."}</div>
        )}
      </div>

      <div className="th2-compose">
        {row.convos.length > 1 && (
          <div className="fchips" role="radiogroup" aria-label="Reply on">
            <span className="meta">Reply on</span>
            {row.convos.map((c) => (
              <button
                type="button"
                role="radio"
                key={c.id}
                aria-checked={via === c.id}
                className="fchip"
                aria-pressed={via === c.id}
                onClick={() => setVia(c.id)}
              >
                {badge(c.platform).name}
              </button>
            ))}
          </div>
        )}
        {waShut ? (
          <div className="th2-shut">
            <p className="f-note">
              It&apos;s been more than 24 hours since {row.name.split(" ")[0]} last wrote on
              WhatsApp, so WhatsApp only allows an approved message now.
            </p>
            <Button size="sm" onClick={onTemplate} disabled={!row.personId}>
              Send an approved WhatsApp message
            </Button>
          </div>
        ) : (
          <>
            <label className="sr" htmlFor="replyBox">
              Reply to {row.name}
            </label>
            <textarea
              id="replyBox"
              rows={3}
              placeholder={`Reply to ${row.name} on ${badge(target.platform).name}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="th2-send">
              <span className="f-note" aria-live="polite">
                {note ?? "Enter sends · Shift+Enter for a new line"}
              </span>
              <Button size="sm" disabled={busy || !draft.trim()} onClick={() => void send()}>
                <Send aria-hidden="true" /> {busy ? "Sending…" : "Send"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A call to the person through the campaign's line, followed live when Twilio reports. */
function CallBox({ conversationId }: { conversationId: string }) {
  const placeCall = useServerFn(callFromInbox);
  const fetchSetup = useServerFn(callSetup);
  const { data: setup } = useQuery({ queryKey: ["call-setup"], queryFn: () => fetchSetup() });
  const [mine, setMine] = useState(() => rememberedPhone());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null | undefined>(undefined);
  const needsPhone = setup ? !setup.officeLine : false;
  async function go() {
    setBusy(true);
    setErr(null);
    setCallId(undefined);
    if (needsPhone) rememberPhone(mine);
    try {
      const r = await placeCall({ data: { conversationId, myPhone: needsPhone ? mine : "" } });
      if (r.ok) setCallId(r.callId);
      else setErr(r.error === "needs-phone" ? "Enter the phone to take the call on." : r.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The call couldn't be placed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="th2-call">
      <div className="ac-row">
        {needsPhone && (
          <input
            className="input"
            inputMode="tel"
            aria-label="Phone to take the call on"
            placeholder="Phone to take the call on, 0712 345 678"
            value={mine}
            onChange={(e) => setMine(e.target.value)}
          />
        )}
        <Button
          size="sm"
          disabled={busy || !setup || (needsPhone && !mine.trim())}
          onClick={() => void go()}
        >
          <Phone aria-hidden="true" /> {busy ? "Calling…" : "Call now"}
        </Button>
      </div>
      {err && (
        <p className="call-line call-line--bad" role="alert">
          {err}
        </p>
      )}
      {callId && <CallProgress callId={callId} />}
      {callId === null && <p className="call-line call-line--busy">Calling…</p>}
    </div>
  );
}
