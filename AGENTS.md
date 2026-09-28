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
