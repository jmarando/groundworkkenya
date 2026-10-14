<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Navigation: fixed sidebar above 1100px; grouped dismissible menu below. Page guards and menus share canOpen() in src/lib/access.ts; agents get field pages only. Why: accessible navigation and consistent access.
- Campaign isolation: campaign tables have campaign_id default my_campaign(), parent/channel-filling triggers and restrictive own-campaign policies. campaign_members holds one campaign per user; user_roles admin means super admin only. Why: enforce tenancy in the database.
- Campaign hosts show campaign-first home/sign-in; root stays general. Vite allows groundwork.ke and subdomains. Why: branding follows hostname, not stale browser state.
- Root head uses /brand/ icons and field.webmanifest on /field, site.webmanifest elsewhere. public/sw.js caches app/offline pages; IndexedDB saves only queries listed in src/lib/offline/saved.ts, never voter files, walk lists or feed. Why: safe field use without signal.
- Channels route through unique campaign_channels kind/identifier. Email replies use <slug>+<conversationId>@in.groundwork.ke and /api/public/email/inbound with EMAIL_INBOUND_TOKEN. Why: inbound messages cannot cross campaigns.
- Listening uses Firecrawl gateway web search plus ScrapeCreators TikTok/Reddit/YouTube search; record social failures per sweep without pausing all collection. Why: survive credit outages.
- SMS uses Twilio when a number/service is configured, otherwise Africa’s Talking. /api/public/twilio/* checks TWILIO_CALLBACK_TOKEN because gateway auth hides provider signatures. Why: provider-neutral outbox.
- Home narration uses authenticated speech, streamed PCM and ordered sentence chunks, with deterministic scripts from Home data. Why: consistent natural voice without invented facts.
- Home keeps full morning story beside a stretched today/upcoming diary, secondary news full-width below. Why: at-a-glance planning.
- Individual poll invitations use campaign-scoped contacts, explicit sender permission, opt-outs, per-recipient reservations and managed email without changing consent. Inbox/polls share WhatsApp template fields and server validation; polls permit only poll templates. Why: isolation, approved wording and retry safety.
- Inbox groups filters by queue, channel/sentiment and topic; separate metadata; two-pane tablet and stacked phone views. Why: scannable messages without timestamp collisions.
- Voters uses native MapLibre pan/pinch/wheel and bounded zoom with explained ward/building actions. Zoom levels: area 8–11, constituency 11–13, ward 13–16, street 16–20. Address stores area/house/colour/base/tab; user moves write it, flights do not. Why: predictable controls and reload/Back state.
- Houses use one public/tiles/ PMTiles per campaigns.map_area (none means no map), built by scripts/geo/house-tiles.ts from Google Open Buildings v3, zoom 16, buildings layer, pc, under 25 MiB. Why: complete area read tile by tile from own host.
- record_door alone writes house_visits; house_doors()/ward_houses() read colours; reads fail soft before migration. Why: one campaign-scoped retry-safe door record.
- Morning jobs use atomic leases, save dated no-source outcomes, retry only missing/zero-source automated rows hourly and retain provider pauses. Hourly callback catches collection failures and checks mornings before rivals. Why: no skipped daily checks or duplicate paid work.
- Archive uses authenticated user-scoped monthly morning/diary reads. Why: historical isolation.
- Public styling stays scoped to .gw-landing with landing-specific workload/phone classes. Why: no console collisions.
- Findings are plain-code rules in src/lib/findings/ over count-only database functions ward_issues, issue_weeks, rival_mention_weeks, ward_spend, ward_supporters, house_doors; return nothing to field agents. Every narrative number is a finding figure. Why: auditable AI grounded only in counts.
