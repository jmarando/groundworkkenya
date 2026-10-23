# Groundwork ↔ Daraja Pulse: briefing and tracking creators

Groundwork campaigns brief creators through Daraja Pulse and see what those creators posted, what
it reached and what they were paid. Pulse keeps everything it already does well (picking creators,
contracts, drafts, M-Pesa payouts); Groundwork sends the brief and reads the results back.

Decisions (20 October 2026): Pulse takes political campaigns. The campaigns' accounts run through
one Pulse agency for now ("as agency").

## The contract

Two Pulse edge functions, called server to server by Groundwork.

- **Auth**: header `x-job-key`, matched by Pulse's `_shared/auth.ts` (`requireCaller(req, { job:
  "groundwork", roles: SUPER_ADMIN })`) against a new `internal_job_keys` row named `groundwork`.
  Both functions set `verify_jwt = false` in `supabase/config.toml` and check the caller themselves,
  as Pulse's AGENTS.md requires. Groundwork keeps the key in `PULSE_JOB_KEY` and the functions'
  base URL (`https://<ref>.supabase.co/functions/v1`) in `PULSE_FUNCTIONS_URL`.
- **Scope**: both functions only ever touch the agency named by Pulse's `GROUNDWORK_AGENCY_SLUG`
  secret, so the key can't reach any other tenant's data.
- **Link**: a Pulse table `groundwork_links (groundwork_campaign_id uuid primary key, campaign_id uuid
  unique references campaigns on delete cascade, client_id uuid, agency_id uuid, created_at)`,
  service role only. One Groundwork campaign is one Pulse campaign.

### POST `groundwork-brief`

Creates the Pulse client and campaign the first time, updates the brief after that.

```json
{
  "groundwork_campaign_id": "ca000000-0000-4000-8000-000000000004",
  "client_name": "Gathoni Wamuchomba for Githunguri",
  "campaign_name": "Githunguri 2027: dairy and bursaries",
  "objective": "…", "brief": "…", "tone": "…",
  "hashtag": "#Githunguri2027", "hashtags_extra": ["#Fresha"],
  "mandatory_mentions": ["@…"], "dos": ["…"], "donts": ["…"],
  "start_date": "2026-10-27", "end_date": "2026-11-30",
  "budget_kes": 600000,
  "paid_for_by": "Paid for by the Friends of Gathoni Wamuchomba"
}
```

Pulse sets `campaigns.political = true` and `campaigns.paid_for_by`, keeps `require_draft_approval =
true`, and always adds two lines the campaign can't remove:
- do: "Label every post as a paid partnership and carry the line: <paid_for_by>."
- don't: "Never appeal to or target anyone by tribe or community."

Answer: `{ "pulse_campaign_id": "…", "status": "draft", "created": true }`.

### POST `groundwork-report`

`{ "groundwork_campaign_id": "…" }` answers what the linked campaign has, or 404 when there is none:

```json
{
  "pulse_campaign_id": "…", "status": "live",
  "creators": [{ "id": "…", "name": "…", "handle": "…", "platform": "tiktok",
                 "followers": 120000, "fee_kes": 40000, "status": "confirmed" }],
  "posts": [{ "id": "…", "creator_id": "…", "platform": "tiktok", "url": "https://…",
              "posted_at": "…", "status": "live",
              "views": 51000, "likes": 4200, "comments": 310, "shares": 190, "reach": null }],
  "payouts": [{ "id": "…", "creator_id": "…", "gross_kes": 40000, "wht_kes": 2000,
                "net_kes": 38000, "status": "paid", "paid_at": "…", "mpesa_ref": "…" }]
}
```

Metrics are each post's peak, from `campaign_post_peak_metrics`.

### POST `groundwork-rapid` (proposed 20 October 2026; Pulse to build)

A reaction brief: something is spreading online and the campaign wants the creators already on its
Pulse campaign to answer it within hours, without replacing the standing brief. Same auth and
scope as the other two; 404 when the campaign has no Pulse link (Groundwork then tells the office
to copy the brief to creators on WhatsApp, which it always offers).

```json
{
  "groundwork_campaign_id": "ca000000-0000-4000-8000-000000000004",
  "rapid_id": "…",                       // Groundwork's rapid_responses id; repeat sends update it
  "post_url": "https://www.tiktok.com/@…/video/…",
  "platform": "tiktok",
  "what_happened": "…", "angle": "…", "creator_brief": "…",
  "dos": ["…", "Label every paid post as a paid partnership with the campaign's \"Paid for by\" line."],
  "donts": ["…", "Never appeal to or target anyone by tribe or community.", "Never attack the person who posted; answer the claim."],
  "respond_by": "2026-10-20T18:00:00Z",
  "platforms": ["tiktok"],
  "creator_ids": ["…"],                  // from groundwork-report's creators; empty lets Pulse choose
  "paid_for_by": "Paid for by …"
}
```

Pulse files it as a task under the linked campaign for the named (or all confirmed) creators,
keeps `require_draft_approval = true`, adds its two fixed lines, and answers
`{ "task_id": "…", "creators_notified": 3 }`. The posts creators make for it come back in
`groundwork-report` like any other.

### Pulse changes this needs

1. Migration: `campaigns.political boolean not null default false`, `campaigns.paid_for_by text`,
   the `groundwork_links` table, and `insert into internal_job_keys(name) values ('groundwork')`.
2. The functions above (`groundwork-rapid` once built), plus their `verify_jwt = false` entries.
3. Political campaigns must not get the default "no politically sensitive content" don't, and
   `discovery-match` should stop excluding political creators *for political campaigns only*.
4. Secret `GROUNDWORK_AGENCY_SLUG`; then read the generated key once from `internal_job_keys` and
   set it as Groundwork's `PULSE_JOB_KEY`.

## Groundwork's side (built)

- `src/lib/pulse.ts`: the brief's checks, and the report read into rows. Pure, tested.
- `src/lib/pulse.server.ts`: the two calls, with the key, a timeout and no key in any log.
- `src/lib/pulse.functions.ts`: send the brief, read the report, add payouts to Finance; the
  candidate and managers only.
- Broadcast: a "Creators · Daraja Pulse" card with the brief, the creators and their posts, and
  payouts with "Add to Finance". Until the two secrets are set it says what's missing.
- `record_creator_payouts` (schema 30): payouts become pending "creators" expenses against the
  spending limit, once each (reference `PULSE-<payout id>`).
