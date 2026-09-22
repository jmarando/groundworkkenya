import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUTORY_LIMIT = 433_800_000;

/* ------------------------------------------------------------------ finance */

export type FinanceData = {
  statutoryLimit: number;
  spendKes: number;
  contributionsKes: number;
  contributors: number;
  inKindKes: number;
  documented: number;
  pending: {
    id: string;
    description: string;
    vendor: string | null;
    reference: string | null;
    amount: number;
    category: string;
  }[];
  byCategory: { name: string; amount: number }[];
  ledger: {
    id: string;
    date: string;
    category: string;
    description: string;
    vendor: string | null;
    reference: string | null;
    amount: number;
    status: string;
  }[];
  contributions: {
    id: string;
    donor: string;
    type: string;
    method: string;
    amount: number;
    reference: string | null;
    date: string;
    disclosed: boolean;
  }[];
};

export const getFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FinanceData> => {
    const sb = context.supabase;
    const [{ data: expenses }, { data: contributions }] = await Promise.all([
      sb.from("expenses").select("*").order("incurred_at", { ascending: false }),
      sb.from("contributions").select("*").order("received_at", { ascending: false }),
    ]);

    const ex = expenses ?? [];
    const co = contributions ?? [];
    const spendKes = ex.reduce((s, e) => s + Number(e.amount_kes ?? 0), 0);
    const documented = ex.length
      ? (ex.filter((e) => !!e.reference).length / ex.length) * 100
      : 100;

    const catMap = new Map<string, number>();
    for (const e of ex) {
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + Number(e.amount_kes ?? 0));
    }

    return {
      statutoryLimit: STATUTORY_LIMIT,
      spendKes,
      contributionsKes: co.reduce((s, c) => s + Number(c.amount_kes ?? 0), 0),
      contributors: new Set(co.map((c) => c.donor_name)).size,
      inKindKes: co
        .filter((c) => c.method === "in_kind")
        .reduce((s, c) => s + Number(c.amount_kes ?? 0), 0),
      documented,
      pending: ex
        .filter((e) => e.status === "pending")
        .map((e) => ({
          id: e.id,
          description: e.description,
          vendor: e.vendor,
          reference: e.reference,
          amount: Number(e.amount_kes ?? 0),
          category: e.category,
        })),
      byCategory: [...catMap.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
      ledger: ex.slice(0, 12).map((e) => ({
        id: e.id,
        date: e.incurred_at as string,
        category: e.category,
        description: e.description,
        vendor: e.vendor,
        reference: e.reference,
        amount: Number(e.amount_kes ?? 0),
        status: e.status,
      })),
      contributions: co.map((c) => ({
        id: c.id,
        donor: c.donor_name,
        type: c.donor_type,
        method: c.method,
        amount: Number(c.amount_kes ?? 0),
        reference: c.reference,
        date: c.received_at as string,
        disclosed: c.disclosed,
      })),
    };
  });

/* ------------------------------------------------------------------- people */

export type PersonRow = {
  id: string;
  name: string;
  phone: string;
  ward: string | null;
  constituency: string | null;
  segment: string | null;
  source: string;
  support: number;
  tags: string[];
  language: string;
  channels: string[];
  optedOut: boolean;
  lastTouch: string | null;
  createdAt: string;
  notes: string | null;
};

export type PeopleData = {
  total: number;
  contactable: number;
  supporters45: number;
  scored: number;
  addedToday: number;
  bySource: { name: string; count: number }[];
  segments: { slug: string; name: string; colour: string | null; count: number }[];
  wards: { id: string; name: string; constituency: string }[];
  duplicates: { phone: string; names: string[] }[];
  rows: PersonRow[];
};

export const getPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PeopleData> => {
    const sb = context.supabase;
    const [{ data: people }, { data: wards }, { data: segments }] = await Promise.all([
      sb
        .from("people")
        .select(
          "id, full_name, phone, ward_id, segment, source, support_score, tags, language, consent_sms, consent_whatsapp, consent_call, opted_out, last_contacted_at, created_at, notes",
        )
        .order("last_contacted_at", { ascending: false, nullsFirst: false })
        .limit(600),
      sb.from("wards").select("id, name, constituency").order("name"),
      sb.from("segments").select("slug, name, colour"),
    ]);

    const wardById = new Map((wards ?? []).map((w) => [w.id, w]));
    const all = people ?? [];

    const rows: PersonRow[] = all.map((p) => {
      const w = p.ward_id ? wardById.get(p.ward_id) : undefined;
      const channels: string[] = [];
      if (p.consent_sms) channels.push("SMS");
      if (p.consent_whatsapp) channels.push("WA");
      if (p.consent_call) channels.push("Call");
      return {
        id: p.id,
        name: p.full_name ?? "Unnamed",
        phone: p.phone,
        ward: w?.name ?? null,
        constituency: w?.constituency ?? null,
        segment: p.segment,
        source: p.source,
        support: p.support_score ?? 0,
        tags: (p.tags as string[]) ?? [],
        language: p.language,
        channels,
        optedOut: p.opted_out,
        lastTouch: (p.last_contacted_at as string | null) ?? null,
        createdAt: p.created_at as string,
        notes: p.notes,
      };
    });

    const srcMap = new Map<string, number>();
    const segMap = new Map<string, number>();
    const phoneMap = new Map<string, string[]>();
    let contactable = 0;
    let supporters45 = 0;
    let scored = 0;
    let addedToday = 0;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    for (const r of rows) {
      srcMap.set(r.source, (srcMap.get(r.source) ?? 0) + 1);
      if (r.segment) segMap.set(r.segment, (segMap.get(r.segment) ?? 0) + 1);
      if (!r.optedOut && r.channels.length) contactable += 1;
      if (r.support >= 4) supporters45 += 1;
      if (r.support > 0) scored += 1;
      if (new Date(r.createdAt).getTime() >= startOfDay.getTime()) addedToday += 1;
      const list = phoneMap.get(r.phone) ?? [];
      list.push(r.name);
      phoneMap.set(r.phone, list);
    }

    return {
      total: rows.length,
      contactable,
      supporters45,
      scored,
      addedToday,
      bySource: [...srcMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      segments: (segments ?? []).map((s) => ({
        slug: s.slug,
        name: s.name,
        colour: s.colour,
        count: segMap.get(s.slug) ?? 0,
      })),
      wards: wards ?? [],
      duplicates: [...phoneMap.entries()]
        .filter(([, names]) => names.length > 1)
        .slice(0, 6)
        .map(([phone, names]) => ({ phone, names })),
      rows,
    };
  });

/* ------------------------------------------------------------------- voters */

export type VotersData = {
  wards: {
    id: string;
    name: string;
    constituency: string;
    registered: number;
    target: number;
    supporters: number;
    people: number;
    contacted: number;
    x: number;
    y: number;
  }[];
  totals: {
    registered: number;
    target: number;
    supporters: number;
    people: number;
    contactedWeek: number;
  };
  feed: { name: string; ward: string | null; support: number; when: string }[];
};

export const getVoters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VotersData> => {
    const sb = context.supabase;
    const [{ data: wards }, { data: people }] = await Promise.all([
      sb.from("wards").select("*").order("constituency"),
      sb
        .from("people")
        .select("id, full_name, ward_id, support_score, last_contacted_at")
        .limit(2000),
    ]);

    const w = wards ?? [];
    const p = people ?? [];
    const week = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const perWard = new Map<string, { people: number; contacted: number }>();
    for (const person of p) {
      if (!person.ward_id) continue;
      const cur = perWard.get(person.ward_id) ?? { people: 0, contacted: 0 };
      cur.people += 1;
      if (person.last_contacted_at && new Date(person.last_contacted_at).getTime() > week) {
        cur.contacted += 1;
      }
      perWard.set(person.ward_id, cur);
    }

    const wardById = new Map(w.map((x) => [x.id, x.name]));

    return {
      wards: w.map((x, i) => ({
        id: x.id,
        name: x.name,
        constituency: x.constituency,
        registered: x.registered_voters ?? 0,
        target: x.target_votes ?? 0,
        supporters: x.supporters ?? 0,
        people: perWard.get(x.id)?.people ?? 0,
        contacted: perWard.get(x.id)?.contacted ?? 0,
        x: Number(x.map_x ?? (i % 10) * 10 + 5),
        y: Number(x.map_y ?? Math.floor(i / 10) * 10 + 5),
      })),
      totals: {
        registered: w.reduce((s, x) => s + (x.registered_voters ?? 0), 0),
        target: w.reduce((s, x) => s + (x.target_votes ?? 0), 0),
        supporters: w.reduce((s, x) => s + (x.supporters ?? 0), 0),
        people: p.length,
        contactedWeek: p.filter(
          (x) => x.last_contacted_at && new Date(x.last_contacted_at).getTime() > week,
        ).length,
      },
      feed: p
        .filter((x) => x.last_contacted_at)
        .sort(
          (a, b) =>
            new Date(b.last_contacted_at as string).getTime() -
            new Date(a.last_contacted_at as string).getTime(),
        )
        .slice(0, 12)
        .map((x) => ({
          name: x.full_name ?? "Unnamed",
          ward: x.ward_id ? (wardById.get(x.ward_id) ?? null) : null,
          support: x.support_score ?? 0,
          when: x.last_contacted_at as string,
        })),
    };
  });

/* -------------------------------------------------------------------- inbox */

export type InboxData = {
  conversations: {
    id: string;
    personId: string | null;
    name: string;
    phone: string | null;
    ward: string | null;
    channel: string;
    subject: string | null;
    snippet: string | null;
    status: string;
    tags: string[];
    unread: boolean;
    lastMessageAt: string;
    thread: { id: string; direction: string; body: string; at: string; status: string }[];
  }[];
  counts: { all: number; unread: number; open: number; byTag: { tag: string; n: number }[] };
};

export const getInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InboxData> => {
    const sb = context.supabase;
    const [{ data: convos }, { data: people }, { data: wards }, { data: messages }] =
      await Promise.all([
        sb.from("conversations").select("*").order("last_message_at", { ascending: false }),
        sb.from("people").select("id, full_name, phone, ward_id").limit(2000),
        sb.from("wards").select("id, name"),
        sb
          .from("messages")
          .select("id, person_id, body, direction, status, created_at, sent_at")
          .order("created_at", { ascending: true })
          .limit(1000),
      ]);

    const personById = new Map((people ?? []).map((p) => [p.id, p]));
    const wardById = new Map((wards ?? []).map((w) => [w.id, w.name]));
    const byPerson = new Map<string, InboxData["conversations"][number]["thread"]>();
    for (const m of messages ?? []) {
      if (!m.person_id) continue;
      const list = byPerson.get(m.person_id) ?? [];
      list.push({
        id: m.id,
        direction: m.direction,
        body: m.body,
        at: (m.sent_at as string) ?? (m.created_at as string),
        status: m.status,
      });
      byPerson.set(m.person_id, list);
    }

    const tagMap = new Map<string, number>();
    const conversations = (convos ?? []).map((c) => {
      const p = c.person_id ? personById.get(c.person_id) : undefined;
      for (const t of (c.tags as string[]) ?? []) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
      return {
        id: c.id,
        personId: c.person_id,
        name: p?.full_name ?? "Unknown number",
        phone: p?.phone ?? null,
        ward: p?.ward_id ? (wardById.get(p.ward_id) ?? null) : null,
        channel: c.channel,
        subject: c.subject,
        snippet: c.snippet,
        status: c.status,
        tags: (c.tags as string[]) ?? [],
        unread: c.unread,
        lastMessageAt: c.last_message_at as string,
        thread: c.person_id ? (byPerson.get(c.person_id) ?? []) : [],
      };
    });

    return {
      conversations,
      counts: {
        all: conversations.length,
        unread: conversations.filter((c) => c.unread).length,
        open: conversations.filter((c) => c.status === "open").length,
        byTag: [...tagMap.entries()]
          .map(([tag, n]) => ({ tag, n }))
          .sort((a, b) => b.n - a.n),
      },
    };
  });

/* ---------------------------------------------------------------- broadcast */

export type BroadcastData = {
  audience: {
    total: number;
    sms: number;
    whatsapp: number;
    call: number;
    optedOut: number;
    support45: number;
    undecided: number;
  };
  wards: { name: string; constituency: string; consented: number }[];
  campaigns: {
    key: string;
    body: string;
    channel: string;
    sent: number;
    delivered: number;
    failed: number;
    replies: number;
    cost: number;
    last: string;
  }[];
  smsRate: number;
};

export const getBroadcast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BroadcastData> => {
    const sb = context.supabase;
    const [{ data: people }, { data: wards }, { data: messages }] = await Promise.all([
      sb
        .from("people")
        .select("ward_id, consent_sms, consent_whatsapp, consent_call, opted_out, support_score")
        .limit(2000),
      sb.from("wards").select("id, name, constituency"),
      sb.from("messages").select("body, channel, direction, status, cost_kes, created_at").limit(1000),
    ]);

    const p = people ?? [];
    const wardById = new Map((wards ?? []).map((w) => [w.id, w]));
    const consentedByWard = new Map<string, number>();
    for (const person of p) {
      if (person.ward_id && person.consent_sms && !person.opted_out) {
        consentedByWard.set(person.ward_id, (consentedByWard.get(person.ward_id) ?? 0) + 1);
      }
    }

    const outs = (messages ?? []).filter((m) => m.direction === "out");
    const ins = (messages ?? []).filter((m) => m.direction === "in");
    const camp = new Map<string, BroadcastData["campaigns"][number]>();
    for (const m of outs) {
      const key = m.body.slice(0, 48);
      const cur =
        camp.get(key) ??
        ({
          key,
          body: m.body,
          channel: m.channel,
          sent: 0,
          delivered: 0,
          failed: 0,
          replies: 0,
          cost: 0,
          last: m.created_at as string,
        } satisfies BroadcastData["campaigns"][number]);
      cur.sent += 1;
      if (m.status === "delivered") cur.delivered += 1;
      if (m.status === "failed") cur.failed += 1;
      cur.cost += Number(m.cost_kes ?? 0);
      if ((m.created_at as string) > cur.last) cur.last = m.created_at as string;
      camp.set(key, cur);
    }
    const campaigns = [...camp.values()].sort((a, b) => b.sent - a.sent);
    const first = campaigns[0];
    if (first) first.replies = ins.length;

    return {
      audience: {
        total: p.length,
        sms: p.filter((x) => x.consent_sms && !x.opted_out).length,
        whatsapp: p.filter((x) => x.consent_whatsapp && !x.opted_out).length,
        call: p.filter((x) => x.consent_call && !x.opted_out).length,
        optedOut: p.filter((x) => x.opted_out).length,
        support45: p.filter((x) => (x.support_score ?? 0) >= 4).length,
        undecided: p.filter((x) => (x.support_score ?? 0) === 3).length,
      },
      wards: [...consentedByWard.entries()]
        .map(([id, consented]) => ({
          name: wardById.get(id)?.name ?? "—",
          constituency: wardById.get(id)?.constituency ?? "—",
          consented,
        }))
        .sort((a, b) => b.consented - a.consented)
        .slice(0, 8),
      campaigns,
      smsRate: 0.8,
    };
  });

/* ------------------------------------------------------------------ polling */

export type PollingData = {
  polls: {
    id: string;
    code: string;
    question: string;
    status: string;
    channels: string[];
    reward: string | null;
    sampleTarget: number;
    opensAt: string | null;
    closesAt: string | null;
    responses: number;
    options: { key: string; label: string; count: number }[];
    channelMix: { channel: string; count: number }[];
  }[];
  heat: {
    constituencies: string[];
    rows: { option: string; shares: number[] }[];
  } | null;
};

export const getPolling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PollingData> => {
    const sb = context.supabase;
    const [{ data: polls }, { data: responses }, { data: wards }] = await Promise.all([
      sb.from("polls").select("*").order("created_at", { ascending: false }),
      sb.from("poll_responses").select("poll_id, option_key, channel, ward_id").limit(5000),
      sb.from("wards").select("id, constituency"),
    ]);

    const res = responses ?? [];
    const wardConst = new Map((wards ?? []).map((w) => [w.id, w.constituency]));

    const out = (polls ?? []).map((p) => {
      const mine = res.filter((r) => r.poll_id === p.id);
      const opts = (p.options as { key: string; label: string }[]) ?? [];
      const chMap = new Map<string, number>();
      for (const r of mine) chMap.set(r.channel, (chMap.get(r.channel) ?? 0) + 1);
      return {
        id: p.id,
        code: p.code,
        question: p.question,
        status: p.status,
        channels: (p.channels as string[]) ?? [],
        reward: p.reward,
        sampleTarget: p.sample_target ?? 0,
        opensAt: (p.opens_at as string | null) ?? null,
        closesAt: (p.closes_at as string | null) ?? null,
        responses: mine.length,
        options: opts.map((o) => ({
          key: o.key,
          label: o.label,
          count: mine.filter((r) => r.option_key === o.key).length,
        })),
        channelMix: [...chMap.entries()].map(([channel, count]) => ({ channel, count })),
      };
    });

    const focus = out.find((p) => p.status === "live") ?? out[0];
    let heat: PollingData["heat"] = null;
    if (focus) {
      const mine = res.filter((r) => r.poll_id === focus.id && r.ward_id);
      const consts = [
        ...new Set(mine.map((r) => wardConst.get(r.ward_id as string) ?? "—")),
      ].sort();
      if (consts.length) {
        heat = {
          constituencies: consts,
          rows: focus.options.map((o) => ({
            option: o.label,
            shares: consts.map((c) => {
              const inC = mine.filter((r) => (wardConst.get(r.ward_id as string) ?? "—") === c);
              if (!inC.length) return 0;
              return (inC.filter((r) => r.option_key === o.key).length / inC.length) * 100;
            }),
          })),
        };
      }
    }

    return { polls: out, heat };
  });

/* ----------------------------------------------------------------- war room */

export type WarRoomData = {
  stations: { total: number; confirmed: number; unstaffed: number; registered: number };
  streams: number;
  constituencies: {
    name: string;
    stations: number;
    confirmed: number;
    registered: number;
  }[];
  incidents: {
    id: string;
    title: string;
    detail: string | null;
    severity: string;
    status: string;
    ward: string | null;
    reportedBy: string | null;
    occurredAt: string;
  }[];
  unstaffedList: { code: string; name: string; ward: string | null; registered: number }[];
};

export const getWarRoom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WarRoomData> => {
    const sb = context.supabase;
    const [{ data: stations }, { data: wards }, { data: incidents }] = await Promise.all([
      sb.from("polling_stations").select("*").order("code"),
      sb.from("wards").select("id, name, constituency"),
      sb.from("incidents").select("*").order("occurred_at", { ascending: false }),
    ]);

    const st = stations ?? [];
    const wardById = new Map((wards ?? []).map((w) => [w.id, w]));
    const byConst = new Map<string, { stations: number; confirmed: number; registered: number }>();
    for (const s of st) {
      const c = s.ward_id ? (wardById.get(s.ward_id)?.constituency ?? "—") : "—";
      const cur = byConst.get(c) ?? { stations: 0, confirmed: 0, registered: 0 };
      cur.stations += 1;
      if (s.status === "confirmed") cur.confirmed += 1;
      cur.registered += s.registered_voters ?? 0;
      byConst.set(c, cur);
    }

    return {
      stations: {
        total: st.length,
        confirmed: st.filter((s) => s.status === "confirmed").length,
        unstaffed: st.filter((s) => s.status !== "confirmed").length,
        registered: st.reduce((s, x) => s + (x.registered_voters ?? 0), 0),
      },
      streams: st.reduce((s, x) => s + (x.streams ?? 1), 0),
      constituencies: [...byConst.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.registered - a.registered),
      incidents: (incidents ?? []).map((i) => ({
        id: i.id,
        title: i.title,
        detail: i.detail,
        severity: i.severity,
        status: i.status,
        ward: i.ward_id ? (wardById.get(i.ward_id)?.name ?? null) : null,
        reportedBy: i.reported_by,
        occurredAt: i.occurred_at as string,
      })),
      unstaffedList: st
        .filter((s) => s.status !== "confirmed")
        .slice(0, 10)
        .map((s) => ({
          code: s.code,
          name: s.name,
          ward: s.ward_id ? (wardById.get(s.ward_id)?.name ?? null) : null,
          registered: s.registered_voters ?? 0,
        })),
    };
  });
