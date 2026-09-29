# Campaign websites, part 1: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each campaign edits a bilingual website in the console and publishes it at
`groundwork.ke/s/<slug>`. Volunteers who sign up there land in that campaign's People list
with SMS double opt-in, and the site shows the campaign's Paybill or Till.

**Architecture:** The content is one JSON document per campaign (`campaign_sites.draft` /
`.published`). Every write goes through security-definer RPCs, so publishing always records
a version. A pure renderer (`src/lib/site/render.ts`) turns cleaned content into a complete
HTML page. The public route and the editor's phone preview both use it. Public pages are
server-rendered with no JavaScript, like `/p/$code`. Photos go to a public Storage bucket,
in a folder named for the campaign.

**Tech stack:** TanStack Start (server route handlers, createServerFn), Supabase Postgres
with RLS, Supabase Storage, React plus the console's existing CSS, and tests run with tsx
and the throwaway-Postgres SQL harness.

## Global constraints

- The repo is public: no secrets, no voter or contact data in commits.
- Every campaign table has `campaign_id` and the restrictive "own campaign only" policy.
  Server code using the service role filters by campaign itself.
- Consent changes only through an action from the phone itself (START/STOP/USSD). A web
  form never sets consent; it only queues one confirmation text (at most one per number
  per day, and 200 per hour across the platform).
- Public pages: no JavaScript, strict CSP, and everything typed by a campaign is escaped.
  Links are https only. Photos come only from the campaign's own folder in `site-media`.
- Schema version goes to 14. Production database writes and publishing need the user's OK.
- Don't reformat files wholesale (pre-existing prettier errors). Lint only the changed lines.

## Files

- Create `supabase/migrations/20260929090000_campaign_websites.sql`: tables, RPCs, the
  bucket and its policies, a reply-routing index, and schema version 14.
- Modify `tests/sql/supabase-stub.sql`: a minimal `storage` schema so the bucket policies
  run and can be tested locally.
- Create `tests/sql/site.test.sql`.
- Create `src/lib/site/content.ts`: the content types, `starterContent`, `cleanContent`,
  `pick`, `textOn` and `mediaUrl`.
- Create `src/lib/site/render.ts`: `renderSite` and `renderPrivacy`, both pure.
- Create `src/lib/site/join.ts`: `parseJoin`, pure.
- Create `src/lib/site/join.server.ts`: `recordVolunteer` (database work).
- Create `src/routes/s.$slug.ts`: GET shows the site, POST handles a volunteer sign-up.
- Create `src/routes/s.$slug_.privacy.ts`: the privacy notice.
- Modify `src/lib/inbound.server.ts`: `upsertPersonByPhone` takes an optional campaign;
  `requestSmsConsent` takes the text; `replyCampaignId`; STOP applies to every campaign
  record with that number; START and answers go to the campaign that last texted the number.
- Modify `src/lib/polls.engine.ts`: `volunteerConsentText(campaign)`.
- Create `src/lib/site.functions.ts`: `getSite`, `saveSiteDraft`, `publishSite`,
  `unpublishSite` and `restoreSiteVersion`.
- Create `src/routes/_authenticated/website.tsx` and `src/components/gw/website/*`
  (`WebsiteEditor`, `SectionCard`, `BiField`, `PhotoField`, `PhonePreview`, `ListEditor`),
  plus the CSS in `src/styles/groundwork.css` (the `ws-*` block).
- Modify `src/components/gw/ConsoleShell.tsx`: add a Website item under Comms.
- Tests: `tests/site.test.ts` (content and renderer), `tests/site-join.test.ts`
  (parseJoin, recordVolunteer), `tests/inbound-routing.test.ts`.

## Task 1: Database (tables, RPCs, storage, version 14)

**Interfaces produced:**
- `campaign_sites(campaign_id unique, draft jsonb, draft_rev int, published jsonb null,
  published_at, published_by, updated_at, updated_by)`
- `site_versions(id, campaign_id, content, published_at, published_by)`
- `save_site_draft(_draft jsonb, _rev int) returns int` (the new rev). It raises
  `Only the candidate or campaign manager can change the website.` (42501), or
  `Someone else changed the website while you were editing. Reload to see their changes.`
  (40001), or `The website is too big to save.` (22023).
- `publish_site() returns timestamptz`. It raises
  `Write something on the website before publishing it.` when the draft is empty. It
  keeps the newest 20 versions.
- `unpublish_site() returns void`
- `restore_site_version(_version uuid) returns int` (the new rev). It raises
  `That version is not available.`
- Storage bucket `site-media`: public, 2 MB, jpeg/png/webp. Insert, select and delete are
  allowed only in `<my_campaign()>/…`, and only for staff (select for the team).
- Index `messages_phone_out_idx on messages (phone, created_at desc) where direction = 'out'`.

- [ ] Add the storage stub (`storage.buckets`, `storage.objects` with RLS on,
      `storage.foldername`, grants to authenticated).
- [ ] Write `tests/sql/site.test.sql` first. It covers: a Sakaja organiser and agent can read
      their site, but a Mathira candidate cannot; an organiser cannot save; the candidate
      saves (rev 0→1→2), and a stale rev raises the conflict message; direct
      insert/update is refused; publish copies the draft and records a version; 22
      publishes keep 20 versions; restore copies a version into the draft and bumps the rev;
      restoring another campaign's version is refused; unpublish clears `published`; anon
      reads nothing; storage: the candidate uploads into their own folder, but not into
      another campaign's folder, and an organiser cannot upload.
- [ ] Run `bash tests/sql/run.sh`. Expect FAIL (no tables).
- [ ] Write the migration. Run again. Expect everything to pass, including the access guards
      (the new tables have `campaign_id` and the restrictive policy).
- [ ] Commit.

## Task 2: Content model and renderer (pure)

**Interfaces produced (src/lib/site/content.ts):**
```ts
export type Lang = "en" | "sw";
export type Bi = { en: string; sw: string };
export type SiteTemplate = "bold" | "classic" | "minimal";
export type SiteContent = {
  v: 1; template: SiteTemplate; lang: Lang;
  colors: { primary: string; accent: string };
  seo: { title: Bi; description: Bi; image: string | null };
  hero: { on: boolean; headline: Bi; sub: Bi; photo: string | null };
  story: { on: boolean; title: Bi; body: Bi; photo: string | null };
  agenda: { on: boolean; title: Bi; pillars: { title: Bi; points: Bi[] }[] };
  events: { on: boolean; title: Bi; items: { date: string; time: string; place: Bi; what: Bi }[] };
  updates: { on: boolean; title: Bi; items: { date: string; title: Bi; body: Bi; photo: string | null }[] };
  volunteer: { on: boolean; title: Bi; pitch: Bi };
  donate: { on: boolean; title: Bi; note: Bi; paybill: string; account: string; till: string };
  contact: { on: boolean; office: Bi; phone: string; whatsapp: string; email: string;
             links: { facebook: string; x: string; instagram: string; tiktok: string; youtube: string } };
};
export function starterContent(c: { name: string; candidate: string | null; seat: string }): SiteContent;
export function cleanContent(input: unknown, campaignId: string): SiteContent;
export function pick(b: Bi, lang: Lang): string;          // falls back to the other language
export function textOn(hex: string): "#000000" | "#ffffff"; // readable text on a colour
export function mediaUrl(base: string, path: string | null): string | null;
```
**src/lib/site/render.ts:**
```ts
export type SiteCampaign = { slug: string; name: string; candidate: string | null; seat: string };
export type JoinValues = { name: string; phone: string; ward: string; helps: string[] };
export type JoinState =
  | { state: "idle" }
  | { state: "error"; message: Bi; values: JoinValues }
  | { state: "done"; name: string };
export type SiteView = {
  campaign: SiteCampaign; content: SiteContent; lang: Lang;
  wards: { id: string; name: string }[]; mediaBase: string; baseUrl: string;
  preview?: boolean; join?: JoinState; renderedAt?: number;
};
export const HELPS: readonly { key: string; label: Bi }[]; // doors, calls, events, agent
export function renderSite(v: SiteView): string;
export function renderPrivacy(v: { campaign: SiteCampaign; content: SiteContent; lang: Lang; baseUrl: string }): string;
```
- [ ] Tests in `tests/site.test.ts`:
  - cleanContent: keeps valid content; a bad colour falls back to the default; `javascript:`
    and `http:` links become ""; a photo outside the campaign's folder becomes null; the
    phone is normalised to +254…; long text is capped; more than 6 pillars or 12 events
    are cut; junk input gives the starter shape.
  - `pick` falls back to the other language.
  - `textOn`: white on dark green, black on yellow.
  - renderSite: `<script>` in the headline is escaped; a switched-off section is absent;
    Swahili headings when `lang` is sw; the donate block shows Paybill and account (or Till);
    the join form lists the wards; preview disables the submit button; the error and done
    states show; the language link points at `?lang=sw`; the hero image URL is built from
    `mediaBase`.
  - renderPrivacy names the campaign and says how to stop (STOP).
- [ ] Run the tests. Expect FAIL. Implement. Expect PASS. Commit.

## Task 3: The public site and volunteer sign-up

**Interfaces:**
- `parseJoin(fields: { get(k: string): unknown }, wards: {id: string}[], now: number)`
  returns `{ kind: "bot" } | { kind: "stale" } | { kind: "error"; message: Bi; values } | { kind: "ok"; values: JoinValues & { phone: string /* +254 */ } }`
- `recordVolunteer(sb, site: { campaignId: string; label: string }, v)` returns
  `Promise<boolean>`. It upserts the person in the site's campaign; sets the name only if
  empty and the ward only if empty and the ward belongs to the campaign; adds the Volunteer
  tag; logs a `volunteer` event with what they offered; opens an inbox conversation; and
  calls `requestSmsConsent(sb, person, volunteerConsentText(label))`.
- `upsertPersonByPhone(sb, phone, source, campaignId?)` inserts with an explicit `campaign_id`.
- [ ] Tests in `tests/site-join.test.ts` with a stand-in database: the honeypot gives bot;
      under 1.5 s gives bot; a bad phone gives an error with the values kept; an unknown
      ward is dropped; ok records the person in the site's campaign (the insert carries
      that campaign_id, not the channel owner's); an existing name is not overwritten; the
      tag is added once; the consent text names the site's campaign.
- [ ] Route `s.$slug.ts`: GET loads the campaign by slug and the published content (404 if
      none), plus wards when the volunteer section is on. It renders with the CSP, whose
      img-src is 'self' plus the Supabase origin, and `Cache-Control: public, max-age=60`.
      POST applies the per-connection limit (`site-join:<visitor>`, 60 per 10 min), then
      parseJoin → recordVolunteer → settleIfDryRun, and renders the site with the join
      state (form action `#join`).
- [ ] Route `s.$slug_.privacy.ts`.
- [ ] Commit.

## Task 4: SMS replies reach the campaign that texted

**Interfaces:** `replyCampaignId(sb, phone)` returns the campaign of the newest outbound SMS
to that number in the last 30 days, or else the channel owner. `handleInboundSms` uses it for
the person record. STOP opts the number out in every campaign.
- [ ] Tests in `tests/inbound-routing.test.ts`: a reply after Mathira's consent text is
      recorded on Mathira's record, and no Sakaja record is created; with no recent text it
      goes to the channel owner; STOP updates every record with that number.
- [ ] Implement. Run all tests. Commit.

## Task 5: The Website screen

**Server functions (src/lib/site.functions.ts):**
- `getSite()` returns `{ campaign: SiteCampaign & { id }, canEdit, draft: SiteContent,
  rev, publishedAt, live: boolean, changed: boolean, versions: {id, publishedAt, by}[], wards }`
- `saveSiteDraft({ content, rev })` cleans on the server, then calls `save_site_draft`,
  and returns `{ rev, savedAt }`.
- `publishSite()`, `unpublishSite()`, and `restoreSiteVersion({ id })`, which returns
  `{ rev, draft }`.
- [ ] The editor: a language switch (English | Kiswahili) that drives both the fields and the
      preview; a template picker; colour inputs; section cards with on/off switches; list
      editors for pillars, points, events and updates; photo fields (the browser shrinks to
      1,280 px JPEG, then uploads to `site-media/<campaign>/<uuid>.jpg`); autosave 1.2 s
      after the last change, with Saving, Saved and Couldn't-save states and a conflict
      banner; Publish, Take offline, and View live; version history with Restore; read-only
      for organisers. The phone preview is a sandboxed iframe with `srcDoc = renderSite(...)`.
- [ ] Nav: "Website" under Comms. `canOpen` already lets the team in and keeps agents out.
- [ ] Regenerate `routeTree.gen.ts` with `npx vite build`. Typecheck. Lint the changed lines.
- [ ] Commit.

## Task 6: Visual check

- [ ] Scratchpad harness (a vite app with mocks for server functions and supabase) that
      renders the Website screen with each template, desktop and phone width. Plus the
      public page rendered from `renderSite`, checked at 375 px and 1280 px. Fix what looks
      wrong.

## Task 7: Release

- [ ] Rebase onto origin/main; run `npm test`; push to a backup branch.
- [ ] Ask the user: apply migration 14 (guarded by the version check, then compare
      checksums), push main, publish. Then verify health `schemaVersion: 14`, find the live
      build marker, and GET `/s/mathira` gives 404 until published.
