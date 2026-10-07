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
- Local Vite preview allows `groundwork.ke` and its subdomains. Why: hostname-based campaign screens must be testable against the actual domain shape.
- The root head provides shared PNG/ICO Chrome favicons and a web manifest using `/brand/` icons. Why: every campaign host and the main site need the same reliable browser-tab and installed-app identity.
- Inbound channels route to a campaign via `campaign_channels` (kind + identifier, unique); email replies thread via `<slug>+<conversationId>@in.groundwork.ke` into `/api/public/email/inbound` (Postmark, `?token=EMAIL_INBOUND_TOKEN`). Why: each campaign brings its own numbers/pages/addresses and messages must never cross campaigns.
- Listening sweep sources: Firecrawl web search (gateway connector) plus ScrapeCreators keyword search (TikTok/Reddit/YouTube, `SCRAPECREATORS_API_KEY`); ScrapeCreators failures (incl. out of credits) are noted per sweep and never pause the whole sweep. Why: web coverage must survive social-credit outages.
- SMS goes through Twilio whenever a Twilio number (or messaging service) is set, otherwise Africa's Talking; Twilio callbacks under `/api/public/twilio/*` check `?token=TWILIO_CALLBACK_TOKEN`. Why: the gateway holds Twilio's auth token, so signatures can't be checked, and one switch keeps the outbox provider-agnostic.
- Home narration uses an authenticated speech route, streamed PCM playback and ordered sentence chunks; keep the editorial script deterministic from Home data. Why: voice quality is consistent across devices without invented campaign facts or browser-dependent accents.
- Render Home's secondary morning news outside the lead-story/diary grid. Why: the headlines can use the full section width without stretching the diary.
- Individual poll invitations use campaign-scoped contacts, the sender's explicit permission confirmation, approved WhatsApp templates and the existing managed email sender; reserve each recipient before sending and always honor opt-outs without changing stored consent. Why: demos must preserve isolation, recipient choices and retry safety.
