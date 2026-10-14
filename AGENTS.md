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

Use a grouped, dismissible menu below 1100px and retain the fixed sidebar above it; the full link row wraps and obscures navigation on phones and tablets.
- Multi-tenancy: every campaign table has `campaign_id` (default `my_campaign()`, a trigger fills it from the parent or the channel-owning campaign) plus a restrictive "own campaign only" policy. Roles live in `campaign_members` (one campaign per user); `user_roles` 'admin' is the super admin only. Why: separation is enforced in the database, not by hiding UI.
- Page access per role lives in `canOpen()` in src/lib/access.ts (menu and page guard both use it); agents get field pages only. Why: one list, so the menu and the pages never disagree.
- Campaign subdomains render a campaign-first home and sign-in experience from the hostname; the root domain remains the general Groundwork site. Why: each team needs a clear, isolated entrance without browser state leaking branding across campaigns.
- Vite allows `groundwork.ke` and subdomains to test campaign hosts.
- Root head shares `/brand/` PNG/ICO favicons across all hosts; it links `field.webmanifest` on `/field` and `site.webmanifest` elsewhere, so the field app installs on its own. Why: consistent installed-app identity, with agents opening straight into the field app.
- Inbound channels route to a campaign via `campaign_channels` (kind + identifier, unique); email replies thread via `<slug>+<conversationId>@in.groundwork.ke` into `/api/public/email/inbound` (Postmark, `?token=EMAIL_INBOUND_TOKEN`). Why: each campaign brings its own numbers/pages/addresses and messages must never cross campaigns.
- Listening sweep sources: Firecrawl web search (gateway connector) plus ScrapeCreators keyword search (TikTok/Reddit/YouTube, `SCRAPECREATORS_API_KEY`); ScrapeCreators failures (incl. out of credits) are noted per sweep and never pause the whole sweep. Why: web coverage must survive social-credit outages.
- SMS goes through Twilio whenever a Twilio number (or messaging service) is set, otherwise Africa's Talking; Twilio callbacks under `/api/public/twilio/*` check `?token=TWILIO_CALLBACK_TOKEN`. Why: the gateway holds Twilio's auth token, so signatures can't be checked, and one switch keeps the outbox provider-agnostic.
- Home narration uses an authenticated speech route, streamed PCM playback and ordered sentence chunks; keep the editorial script deterministic from Home data. Why: voice quality is consistent across devices without invented campaign facts or browser-dependent accents.
- Keep the full morning story beside a stretched diary panel containing today's and upcoming entries; secondary morning news spans the width below. Why: the diary uses the available height for at-a-glance planning.
- Individual poll invitations use campaign-scoped contacts, the sender's explicit permission confirmation, approved WhatsApp templates and the existing managed email sender; reserve each recipient before sending and always honor opt-outs without changing stored consent. Why: demos must preserve isolation, recipient choices and retry safety.

- Inbox filters are grouped by queue, channel/sentiment and topic; message metadata is a separate block, with a two-pane tablet layout and stacked phone layout. Why: filters stay scannable and timestamps never run into message text.
- The voters map uses MapLibre's native pan, wheel/pinch and bounded animated zoom; ward/building actions stay explained in-map. Why: field users need predictable spatial controls and one clear next step.
- Houses come from one PMTiles file per map area in `public/tiles/` (Google Open Buildings v3, zoom-16 tiles, layer `buildings`, plus code `pc`), built by `scripts/geo/house-tiles.ts`, each under 25 MiB; a campaign's area is `campaigns.map_area`, and none means no map. Why: every house in the area, read a tile at a time by the map and the field app, from the app's own host.
- A door at a house is a `house_visits` row, written only by `record_door`; the map's colours read it through `house_doors()` and `ward_houses()`, and every read fails soft before the migration. Why: one retry-safe record per door, scoped to the campaign by row-level security.
- The Voters map's level follows the zoom (area 8–11, constituency 11–13, ward 13–16, street 16–20), and its address holds the area, house, colour, base map and tab: the person's moves write it, the app's flights don't. Why: zooming in and clicking in land in the same place, and a link, a reload or Back reopens the same view.
- Morning briefings reserve an atomic database lease, save dated no-source outcomes, and retry only missing or zero-source automated rows on later hourly runs; provider blocks stay paused. Why: daily checks remain visible without fabricating news or duplicating paid work.
- The hourly callback catches collection failures and checks morning records before rival work. Why: a failed search must not skip the daily briefing check.
- The shared archive reads monthly morning stories and diary through authenticated user-scoped clients. Why: historical campaign records retain the same isolation as current records.
- Scope public layout to `.gw-landing`; use landing-specific workload and phone classes to prevent console style collisions.
- Findings are plain-code rules (`src/lib/findings/`) over counts from database functions (`ward_issues`, `issue_weeks`, `rival_mention_weeks`, `ward_spend`, `ward_supporters`, `house_doors`) that return counts only and nothing to field agents; every number in a finding's line is one of its figures. Why: part 3's AI writes only from findings, and a checker can hold it to them.
