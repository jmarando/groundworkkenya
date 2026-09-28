# Multi-campaign workspaces

## What you get
- Three separate campaigns, each with its own web address and data:
  - **Kalonzo 2027**, Presidential: `kalonzo.groundwork.ke`
  - **Sakaja 2027**, Governor, Nairobi: `sakaja.groundwork.ke`
  - **Waruru Gikandi**, MP, Mathira: `mathira.groundwork.ke`
- Each person belongs to one campaign. Signing in on another campaign's address shows "You're not part of this campaign".
- Five access levels in each campaign:
  - **Candidate** and **Campaign manager**: everything, including Finance. The candidate admits people and changes roles.
  - **Organiser**: people, polls, inbox and field work. No finance.
  - **Field agent**: walk lists and canvassing only.
  - **Super admin** (you): sees every campaign, creates new ones and invites each candidate.
- A new **Campaigns** screen, for you only: add a campaign, set its address, invite its candidate.
- The Team screen lists only that campaign's people. The candidate invites and admits their own team.
- `groundwork.ke` stays the public homepage. Signing in there takes each person to their campaign.

## Existing data
The existing records are split three ways:
- Nairobi wards, stations, people and listening go to Sakaja.
- Mathira wards and their people go to Waruru Gikandi.
- Kalonzo gets its presidential data, starting from the Kalonzo demo scenario.
You can check the split before it's final.

## What you need to do
- Add a DNS record at your domain provider for each campaign address (or one wildcard `*` record), then add each address under Domains. I'll give you the exact records.
- Until those addresses work, the preview uses a campaign picker that only you see.

## Technical section
- New tables: `campaigns` (slug, name, seat, level, host) and `campaign_members` (campaign_id, user_id, role enum: candidate, manager, organiser, agent). Each user has at most one membership, enforced with a unique user_id. Super admin comes from the existing `user_roles` admin row.
- Add `campaign_id uuid not null` to every campaign table (people, wards, polls, messages, conversations, broadcasts, finance, stations, listening, and so on) and index it. Backfill by ward and constituency, then enforce not null.
- Security-definer helpers: `current_campaign()`, taken from the request host or a JWT claim through `campaign_members`; `has_campaign_role(campaign, roles[])`; `is_super_admin()`. Rewrite every RLS policy to `campaign_id = my_campaign()` plus a role check. Finance tables require candidate or manager.
- Rewrite RPCs (add_person, queue_broadcast, launch_poll, record_door, import, walk_list, ward_map and others) to stamp and filter by campaign.
- Inbound webhooks (WhatsApp, SMS, USSD) find the campaign from the receiving number or shortcode. Each campaign stores its own channel settings.
- Frontend: resolve the campaign from `window.location.host`. `useAccess` returns the campaign and role. The console shell shows the campaign name and hides nav items by role. Add a super-admin campaign switcher.
- Extend SQL tests so users from different campaigns can't read each other's data, and add a finance-role test.
