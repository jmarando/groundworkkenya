// The Website screen: the campaign's public site, written in English and
// Swahili with a phone preview beside it. The draft saves itself a moment
// after each change; the candidate or campaign manager publishes, and every
// publish is kept so an older one can be brought back. The rest of the team
// can look but not change anything.

import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BiField, ItemTools, SectionCard, TextField } from "./fields";
import { PhonePreview } from "./PhonePreview";
import { PhotoField } from "./PhotoField";
import { LANG_NAME, move, siteMediaBase } from "./util";
import {
  cleanContent,
  LIMITS,
  SOCIALS,
  TEMPLATES,
  type Lang,
  type SiteContent,
  type SiteTemplate,
  type Social,
} from "@/lib/site/content";
import { renderSite } from "@/lib/site/render";
import {
  publishSite,
  restoreSiteVersion,
  saveSiteDraft,
  unpublishSite,
  type SiteData,
} from "@/lib/site.functions";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const TEMPLATE_INFO: Record<SiteTemplate, { name: string; line: string }> = {
  bold: { name: "Bold", line: "Big type on your colour" },
  classic: { name: "Classic", line: "Serif headings, centred" },
  minimal: { name: "Minimal", line: "Quiet, lots of white" },
};

const SWATCHES = [
  "#14532d",
  "#15803d",
  "#1e3a8a",
  "#1d4ed8",
  "#b91c1c",
  "#ea580c",
  "#f5b700",
  "#6b21a8",
  "#141c19",
];

const SOCIAL_LABEL: Record<Social, string> = {
  facebook: "Facebook page",
  x: "X (Twitter)",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const blank = () => ({ en: "", sw: "" });

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const todayIso = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);

/** Where the site lives: groundwork.ke on the real site, this server when testing. */
function siteUrl(slug: string): string {
  if (typeof window === "undefined") return `https://groundwork.ke/s/${slug}`;
  const host = window.location.hostname;
  return /(^|\.)groundwork\.ke$/.test(host)
    ? `https://groundwork.ke/s/${slug}`
    : `${window.location.origin}/s/${slug}`;
}

export function WebsiteEditor({
  data,
  onReload,
  onChanged,
}: {
  data: SiteData;
  /** Load the draft from the server again, dropping unsaved edits. */
  onReload: () => void;
  /** Something changed on the server (a publish): refresh the history. */
  onChanged: () => void;
}) {
  const save = useServerFn(saveSiteDraft);
  const publish = useServerFn(publishSite);
  const unpublish = useServerFn(unpublishSite);
  const restore = useServerFn(restoreSiteVersion);

  const canEdit = data.canEdit;
  const campaignId = data.campaign.id;
  const [draft, setDraft] = useState<SiteContent>(data.draft);
  const [lang, setLang] = useState<Lang>(data.draft.lang);
  const [state, setState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<string | null>(data.savedAt);
  const [changed, setChanged] = useState(data.changed);
  const [busy, setBusy] = useState<"publish" | "offline" | "restore" | null>(null);

  const latest = useRef(draft);
  const rev = useRef(data.rev);
  const dirty = useRef(false);
  const conflict = useRef(false);
  const inflight = useRef<Promise<boolean> | null>(null);

  /** Save whatever is waiting, one save at a time. True when all of it is saved. */
  const pump = useCallback((): Promise<boolean> => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      try {
        while (dirty.current && !conflict.current) {
          dirty.current = false;
          setState("saving");
          const r = await save({ data: { content: latest.current, rev: rev.current } });
          if (!r.ok) {
            conflict.current = true;
            setState("conflict");
            return false;
          }
          rev.current = r.rev;
          setSavedAt(r.savedAt);
        }
        if (conflict.current) return false;
        setState(dirty.current ? "dirty" : "saved");
        return !dirty.current;
      } catch {
        dirty.current = true;
        setState("error");
        return false;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [save]);

  const edit = useCallback(
    (fn: (d: SiteContent) => void) => {
      if (!canEdit || conflict.current) return;
      const next = structuredClone(latest.current);
      fn(next);
      latest.current = next;
      setDraft(next);
      dirty.current = true;
      setChanged(true);
      setState("dirty");
    },
    [canEdit],
  );

  // Save a moment after the last change.
  useEffect(() => {
    if (state !== "dirty") return;
    const t = setTimeout(() => void pump(), 1200);
    return () => clearTimeout(t);
  }, [draft, state, pump]);

  // Don't let someone close the tab on unsaved work.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || inflight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const kept = useMemo(() => cleanContent(draft, campaignId), [draft, campaignId]);
  const html = useMemo(
    () =>
      renderSite({
        campaign: data.campaign,
        content: draft,
        lang,
        wards: data.wards,
        mediaBase: siteMediaBase(),
        baseUrl: "https://groundwork.ke",
        preview: true,
      }),
    [data.campaign, data.wards, draft, lang],
  );
  const url = siteUrl(data.campaign.slug);
  const shownUrl = url.replace(/^https?:\/\//, "");

  async function doPublish() {
    setBusy("publish");
    try {
      if (!(await pump())) {
        throw new Error(
          conflict.current
            ? "Someone else changed the website. Load the latest version before publishing."
            : "Could not save your latest changes. Check your connection and try again.",
        );
      }
      await publish();
      setChanged(false);
      toast.success(`Published. It is live at ${shownUrl}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(null);
    }
  }

  async function doOffline() {
    const sure = window.confirm(
      "Take the website offline? Visitors will see a 'not found' page until you publish again. Your draft and history stay.",
    );
    if (!sure) return;
    setBusy("offline");
    try {
      await unpublish();
      setChanged(true);
      toast.success("The website is offline.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not take the website offline.");
    } finally {
      setBusy(null);
    }
  }

  async function doRestore(id: string, at: string) {
    const sure = window.confirm(
      `Bring back the version published ${when(at)}? It replaces the draft. Nothing changes for visitors until you publish.`,
    );
    if (!sure) return;
    setBusy("restore");
    try {
      await pump();
      const r = await restore({ data: { id } });
      rev.current = r.rev;
      latest.current = r.draft;
      dirty.current = false;
      setDraft(r.draft);
      setChanged(true);
      setState("saved");
      setSavedAt(new Date().toISOString());
      toast.success("That version is back in the draft. Publish to put it live.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not bring that version back.");
    } finally {
      setBusy(null);
    }
  }

  const off = !canEdit;
  const status =
    state === "saving"
      ? "Saving…"
      : state === "dirty"
        ? "Unsaved changes"
        : state === "error"
          ? "Could not save. Retrying on your next change."
          : state === "conflict"
            ? "Not saved"
            : savedAt
              ? `Draft saved ${when(savedAt)}`
              : "Nothing saved yet";
  const liveLine = data.live
    ? `Live at ${shownUrl} · published ${when(data.publishedAt)}${changed ? " · the draft has changes not yet published" : " · up to date"}`
    : data.versions.length
      ? `Offline · last published ${when(data.versions[0]?.publishedAt ?? null)}`
      : "Not published yet";

  return (
    <section className="view active ws" aria-label="Website">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Comms · website</span>
          <h1>
            Your site, <span className="serif">your words.</span>
          </h1>
          <p className="meta">{liveLine}</p>
        </div>
        <div className="vh-side">
          <span className="ws-status" data-state={state} role="status">
            <span className="dot" aria-hidden="true" />
            {status}
          </span>
          <div className="ws-actions">
            {data.live ? (
              <a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noreferrer">
                View live
              </a>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy !== null || state === "conflict"}
                onClick={() => void doPublish()}
              >
                {busy === "publish" ? "Publishing…" : data.live ? "Publish changes" : "Publish"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {state === "conflict" ? (
        <div className="ws-banner" role="alert">
          <span>
            Someone else saved the website while you were editing. Load their version to carry on;
            your last changes here were not saved.
          </span>
          <button type="button" className="btn btn--primary btn--sm" onClick={onReload}>
            Load the latest
          </button>
        </div>
      ) : null}
      {off ? (
        <p className="ws-note">
          Only the candidate or the campaign manager can change the website. You can look around and
          preview it.
        </p>
      ) : null}

      <div className="ws-grid">
        <div className="ws-form">
          <div className="ws-bar">
            <div className="ws-bar-l">
              <span className="ws-label">Writing in</span>
              <div className="seg" role="group" aria-label="Language you are writing in">
                {(["en", "sw"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    onClick={() => setLang(l)}
                  >
                    {LANG_NAME[l]}
                  </button>
                ))}
              </div>
            </div>
            <span className="ws-hint">The preview follows. Visitors can switch language.</span>
          </div>

          <SectionCard title="Look" hint="Choose a layout and your campaign's colours.">
            <div className="ws-templates" role="group" aria-label="Layout">
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="ws-template"
                  aria-pressed={draft.template === t}
                  disabled={off}
                  onClick={() => edit((d) => void (d.template = t))}
                >
                  <b>{TEMPLATE_INFO[t].name}</b>
                  <span>{TEMPLATE_INFO[t].line}</span>
                </button>
              ))}
            </div>
            <div className="ws-colours">
              {(["primary", "accent"] as const).map((k) => (
                <div className="ws-field" key={k}>
                  <span className="ws-label">
                    {k === "primary" ? "Main colour" : "Second colour"}
                  </span>
                  <div
                    className="ws-swatches"
                    role="group"
                    aria-label={k === "primary" ? "Main colour" : "Second colour"}
                  >
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="ws-swatch"
                        style={{ background: c }}
                        aria-label={c}
                        aria-pressed={draft.colors[k] === c}
                        disabled={off}
                        onClick={() => edit((d) => void (d.colors[k] = c))}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label={`Any ${k === "primary" ? "main" : "second"} colour`}
                      value={kept.colors[k]}
                      disabled={off}
                      onChange={(e) => {
                        const v = e.target.value;
                        edit((d) => void (d.colors[k] = v));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="ws-field">
              <span className="ws-label">Visitors see first</span>
              <div className="seg" role="group" aria-label="Language visitors see first">
                {(["en", "sw"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={draft.lang === l}
                    disabled={off}
                    onClick={() => edit((d) => void (d.lang = l))}
                  >
                    {LANG_NAME[l]}
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="First screen"
            hint="The headline, one line under it, and a photo. Buttons to join and to donate are added for you."
            on={draft.hero.on}
            onToggle={(on) => edit((d) => void (d.hero.on = on))}
            disabled={off}
          >
            <BiField
              label="Headline"
              value={draft.hero.headline}
              lang={lang}
              max={LIMITS.headline}
              disabled={off}
              onChange={(v) => edit((d) => void (d.hero.headline = v))}
            />
            <BiField
              label="Under the headline"
              value={draft.hero.sub}
              lang={lang}
              max={LIMITS.sub}
              disabled={off}
              onChange={(v) => edit((d) => void (d.hero.sub = v))}
            />
            <PhotoField
              label="Photo"
              value={draft.hero.photo}
              campaignId={campaignId}
              disabled={off}
              hint="A clear photo of the candidate. Portrait photos work best."
              onChange={(p) => edit((d) => void (d.hero.photo = p))}
            />
          </SectionCard>

          <SectionCard
            title="Our story"
            hint="Who the candidate is and why they are running. Leave a blank line between paragraphs."
            on={draft.story.on}
            onToggle={(on) => edit((d) => void (d.story.on = on))}
            disabled={off}
          >
            <BiField
              label="Heading"
              value={draft.story.title}
              lang={lang}
              max={LIMITS.title}
              placeholder={lang === "sw" ? "Historia yetu" : "Our story"}
              disabled={off}
              onChange={(v) => edit((d) => void (d.story.title = v))}
            />
            <BiField
              label="Story"
              value={draft.story.body}
              lang={lang}
              max={LIMITS.body}
              multiline
              rows={8}
              disabled={off}
              onChange={(v) => edit((d) => void (d.story.body = v))}
            />
            <PhotoField
              label="Photo"
              value={draft.story.photo}
              campaignId={campaignId}
              disabled={off}
              onChange={(p) => edit((d) => void (d.story.photo = p))}
            />
          </SectionCard>

          <SectionCard
            title="Agenda"
            hint={`Up to ${LIMITS.pillars} pillars, each with up to ${LIMITS.points} commitments.`}
            on={draft.agenda.on}
            onToggle={(on) => edit((d) => void (d.agenda.on = on))}
            disabled={off}
          >
            <BiField
              label="Heading"
              value={draft.agenda.title}
              lang={lang}
              max={LIMITS.title}
              placeholder={lang === "sw" ? "Ajenda" : "Agenda"}
              disabled={off}
              onChange={(v) => edit((d) => void (d.agenda.title = v))}
            />
            {draft.agenda.pillars.map((p, i) => (
              <div className="ws-item" key={i}>
                <div className="ws-item-head">
                  <span className="ws-item-n">Pillar {i + 1}</span>
                  <ItemTools
                    index={i}
                    count={draft.agenda.pillars.length}
                    what="pillar"
                    disabled={off}
                    onMove={(a, b) =>
                      edit((d) => void (d.agenda.pillars = move(d.agenda.pillars, a, b)))
                    }
                    onRemove={(a) => edit((d) => void d.agenda.pillars.splice(a, 1))}
                  />
                </div>
                <BiField
                  label="Pillar"
                  value={p.title}
                  lang={lang}
                  max={LIMITS.pillar}
                  placeholder={lang === "sw" ? "Mfano: Maji" : "For example: Water"}
                  disabled={off}
                  onChange={(v) => edit((d) => void (d.agenda.pillars[i]!.title = v))}
                />
                {p.points.map((pt, j) => (
                  <div className="ws-point" key={j}>
                    <BiField
                      label={`Commitment ${j + 1}`}
                      value={pt}
                      lang={lang}
                      max={LIMITS.point}
                      disabled={off}
                      onChange={(v) => edit((d) => void (d.agenda.pillars[i]!.points[j] = v))}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={off}
                      onClick={() => edit((d) => void d.agenda.pillars[i]!.points.splice(j, 1))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {p.points.length < LIMITS.points ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm ws-add"
                    disabled={off}
                    onClick={() => edit((d) => void d.agenda.pillars[i]!.points.push(blank()))}
                  >
                    Add a commitment
                  </button>
                ) : null}
              </div>
            ))}
            {draft.agenda.pillars.length < LIMITS.pillars ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm ws-add"
                disabled={off}
                onClick={() =>
                  edit((d) => void d.agenda.pillars.push({ title: blank(), points: [blank()] }))
                }
              >
                Add a pillar
              </button>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Events"
            hint="Rallies, town halls, church visits. Past events drop off the site by themselves."
            on={draft.events.on}
            onToggle={(on) => edit((d) => void (d.events.on = on))}
            disabled={off}
          >
            {draft.events.items.map((e, i) => (
              <div className="ws-item" key={i}>
                <div className="ws-item-head">
                  <span className="ws-item-n">Event {i + 1}</span>
                  <ItemTools
                    index={i}
                    count={draft.events.items.length}
                    what="event"
                    disabled={off}
                    onMove={(a, b) =>
                      edit((d) => void (d.events.items = move(d.events.items, a, b)))
                    }
                    onRemove={(a) => edit((d) => void d.events.items.splice(a, 1))}
                  />
                </div>
                <BiField
                  label="What"
                  value={e.what}
                  lang={lang}
                  max={LIMITS.what}
                  placeholder={
                    lang === "sw" ? "Mfano: Mkutano wa hadhara" : "For example: Town hall"
                  }
                  disabled={off}
                  onChange={(v) => edit((d) => void (d.events.items[i]!.what = v))}
                />
                <div className="ws-row">
                  <TextField
                    label="Date"
                    type="date"
                    value={e.date}
                    disabled={off}
                    onChange={(v) => edit((d) => void (d.events.items[i]!.date = v))}
                  />
                  <TextField
                    label="Time"
                    type="time"
                    value={e.time}
                    disabled={off}
                    onChange={(v) => edit((d) => void (d.events.items[i]!.time = v))}
                  />
                </div>
                <BiField
                  label="Where"
                  value={e.place}
                  lang={lang}
                  max={LIMITS.place}
                  disabled={off}
                  onChange={(v) => edit((d) => void (d.events.items[i]!.place = v))}
                />
              </div>
            ))}
            {draft.events.items.length < LIMITS.events ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm ws-add"
                disabled={off}
                onClick={() =>
                  edit(
                    (d) =>
                      void d.events.items.push({
                        date: "",
                        time: "",
                        place: blank(),
                        what: blank(),
                      }),
                  )
                }
              >
                Add an event
              </button>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Updates"
            hint="News from the campaign, newest first."
            on={draft.updates.on}
            onToggle={(on) => edit((d) => void (d.updates.on = on))}
            disabled={off}
          >
            {draft.updates.items.length < LIMITS.updates ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm ws-add"
                disabled={off}
                onClick={() =>
                  edit(
                    (d) =>
                      void d.updates.items.unshift({
                        date: todayIso(),
                        title: blank(),
                        body: blank(),
                        photo: null,
                      }),
                  )
                }
              >
                Add an update
              </button>
            ) : null}
            {draft.updates.items.map((u, i) => (
              <div className="ws-item" key={i}>
                <div className="ws-item-head">
                  <span className="ws-item-n">Update {i + 1}</span>
                  <ItemTools
                    index={i}
                    count={draft.updates.items.length}
                    what="update"
                    disabled={off}
                    onMove={(a, b) =>
                      edit((d) => void (d.updates.items = move(d.updates.items, a, b)))
                    }
                    onRemove={(a) => edit((d) => void d.updates.items.splice(a, 1))}
                  />
                </div>
                <TextField
                  label="Date"
                  type="date"
                  value={u.date}
                  disabled={off}
                  onChange={(v) => edit((d) => void (d.updates.items[i]!.date = v))}
                />
                <BiField
                  label="Title"
                  value={u.title}
                  lang={lang}
                  max={LIMITS.updateTitle}
                  disabled={off}
                  onChange={(v) => edit((d) => void (d.updates.items[i]!.title = v))}
                />
                <BiField
                  label="Text"
                  value={u.body}
                  lang={lang}
                  max={LIMITS.updateBody}
                  multiline
                  rows={5}
                  disabled={off}
                  onChange={(v) => edit((d) => void (d.updates.items[i]!.body = v))}
                />
                <PhotoField
                  label="Photo"
                  value={u.photo}
                  campaignId={campaignId}
                  disabled={off}
                  onChange={(p) => edit((d) => void (d.updates.items[i]!.photo = p))}
                />
              </div>
            ))}
          </SectionCard>

          <SectionCard
            title="Volunteer"
            hint="A sign-up form follows your words. Sign-ups go to People, tagged Volunteer, and get one text asking them to reply START."
            on={draft.volunteer.on}
            onToggle={(on) => edit((d) => void (d.volunteer.on = on))}
            disabled={off}
          >
            <BiField
              label="Heading"
              value={draft.volunteer.title}
              lang={lang}
              max={LIMITS.title}
              placeholder={lang === "sw" ? "Jitolee" : "Volunteer"}
              disabled={off}
              onChange={(v) => edit((d) => void (d.volunteer.title = v))}
            />
            <BiField
              label="Why join"
              value={draft.volunteer.pitch}
              lang={lang}
              max={LIMITS.pitch}
              multiline
              rows={3}
              placeholder={
                lang === "sw"
                  ? "Bisha hodi mlangoni, piga simu, saidia kwenye mikutano…"
                  : "Knock on doors, make calls, help at events…"
              }
              disabled={off}
              onChange={(v) => edit((d) => void (d.volunteer.pitch = v))}
            />
            <p className="ws-hint">
              {data.wards.length
                ? `Volunteers pick one of your ${data.wards.length} wards.`
                : "Your campaign has too many wards (or none) to list, so the form doesn't ask for one."}
            </p>
          </SectionCard>

          <SectionCard
            title="Donate"
            hint="Your M-PESA Paybill or Till number, with the steps to pay. A payment prompt sent to the donor's phone comes next."
            on={draft.donate.on}
            onToggle={(on) => edit((d) => void (d.donate.on = on))}
            disabled={off}
          >
            <div className="ws-row">
              <TextField
                label="Paybill number"
                value={draft.donate.paybill}
                inputMode="numeric"
                max={12}
                disabled={off}
                warn={draft.donate.paybill.trim() && !kept.donate.paybill ? "5 to 7 digits." : null}
                onChange={(v) => edit((d) => void (d.donate.paybill = v))}
              />
              <TextField
                label="Account number"
                value={draft.donate.account}
                max={20}
                placeholder="Optional"
                disabled={off}
                warn={
                  draft.donate.account.trim() && !kept.donate.account
                    ? "Letters, numbers, spaces and dashes only."
                    : null
                }
                onChange={(v) => edit((d) => void (d.donate.account = v))}
              />
              <TextField
                label="Or a Till number"
                value={draft.donate.till}
                inputMode="numeric"
                max={12}
                disabled={off}
                warn={draft.donate.till.trim() && !kept.donate.till ? "5 to 7 digits." : null}
                onChange={(v) => edit((d) => void (d.donate.till = v))}
              />
            </div>
            <BiField
              label="A word to donors"
              value={draft.donate.note}
              lang={lang}
              max={LIMITS.note}
              multiline
              rows={3}
              disabled={off}
              onChange={(v) => edit((d) => void (d.donate.note = v))}
            />
            {draft.donate.on && !kept.donate.paybill && !kept.donate.till ? (
              <p className="ws-hint ws-warn">
                Add a Paybill or Till number, or this section stays off the site.
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Contact"
            on={draft.contact.on}
            onToggle={(on) => edit((d) => void (d.contact.on = on))}
            disabled={off}
          >
            <BiField
              label="Office"
              value={draft.contact.office}
              lang={lang}
              max={LIMITS.office}
              placeholder={
                lang === "sw"
                  ? "Mfano: Ofisi ya kampeni, Karatina"
                  : "For example: Campaign office, Karatina"
              }
              disabled={off}
              onChange={(v) => edit((d) => void (d.contact.office = v))}
            />
            <div className="ws-row">
              <TextField
                label="Phone"
                type="tel"
                value={draft.contact.phone}
                placeholder="0712 345 678"
                disabled={off}
                warn={
                  draft.contact.phone.trim() && !kept.contact.phone
                    ? "Use a Kenyan mobile number."
                    : null
                }
                onChange={(v) => edit((d) => void (d.contact.phone = v))}
              />
              <TextField
                label="WhatsApp"
                type="tel"
                value={draft.contact.whatsapp}
                placeholder="0712 345 678"
                disabled={off}
                warn={
                  draft.contact.whatsapp.trim() && !kept.contact.whatsapp
                    ? "Use a Kenyan mobile number."
                    : null
                }
                onChange={(v) => edit((d) => void (d.contact.whatsapp = v))}
              />
              <TextField
                label="Email"
                type="email"
                value={draft.contact.email}
                disabled={off}
                warn={
                  draft.contact.email.trim() && !kept.contact.email
                    ? "That doesn't look like an email address."
                    : null
                }
                onChange={(v) => edit((d) => void (d.contact.email = v))}
              />
            </div>
            <div className="ws-row">
              {SOCIALS.map((s) => (
                <TextField
                  key={s}
                  label={SOCIAL_LABEL[s]}
                  type="url"
                  value={draft.contact.links[s]}
                  placeholder="https://"
                  disabled={off}
                  warn={
                    draft.contact.links[s].trim() && !kept.contact.links[s]
                      ? `Paste the full https:// address of your ${SOCIAL_LABEL[s]}.`
                      : null
                  }
                  onChange={(v) => edit((d) => void (d.contact.links[s] = v))}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="When the link is shared"
            hint="What WhatsApp, Facebook and X show when someone shares the site. Left empty, the headline and first photo are used."
          >
            <BiField
              label="Title"
              value={draft.seo.title}
              lang={lang}
              max={LIMITS.seoTitle}
              placeholder={`${data.campaign.candidate || data.campaign.name} · ${data.campaign.seat}`}
              disabled={off}
              onChange={(v) => edit((d) => void (d.seo.title = v))}
            />
            <BiField
              label="Description"
              value={draft.seo.description}
              lang={lang}
              max={LIMITS.seoDescription}
              multiline
              rows={2}
              disabled={off}
              onChange={(v) => edit((d) => void (d.seo.description = v))}
            />
            <PhotoField
              label="Picture"
              value={draft.seo.image}
              campaignId={campaignId}
              disabled={off}
              hint="A wide picture works best."
              onChange={(p) => edit((d) => void (d.seo.image = p))}
            />
          </SectionCard>

          <SectionCard
            title="Published versions"
            hint="Every publish is kept, the last 20. Bring one back into the draft, then publish it."
          >
            {data.versions.length ? (
              <ul className="ws-versions">
                {data.versions.map((v, i) => (
                  <li key={v.id}>
                    <span>{when(v.publishedAt)}</span>
                    <span className="who">
                      {v.by ?? ""}
                      {i === 0 && data.live ? " · live now" : ""}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy !== null}
                        onClick={() => void doRestore(v.id, v.publishedAt)}
                      >
                        Bring back
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-hint">Nothing published yet.</p>
            )}
            {data.live && canEdit ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm ws-danger ws-add"
                disabled={busy !== null}
                onClick={() => void doOffline()}
              >
                {busy === "offline" ? "Taking it offline…" : "Take the website offline"}
              </button>
            ) : null}
          </SectionCard>
        </div>

        <aside className="ws-side" aria-label="Preview">
          <PhonePreview html={html} />
          <p className="ws-hint">
            Preview in {LANG_NAME[lang]}. The form is switched off here.
            {data.live ? (
              <>
                {" "}
                <a href={url} target="_blank" rel="noreferrer">
                  Open the live site
                </a>
              </>
            ) : null}
          </p>
        </aside>
      </div>
    </section>
  );
}
