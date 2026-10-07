# Groundwork → Lovable migration

Scope agreed: full app with real backend, brand kept but tidied, no live channels yet
(dry-run), proper email/password accounts with roles.

## Foundation
- [x] Enable Lovable Cloud
- [x] Brand assets into public/brand + favicon
- [x] Port Groundwork CSS design system (src/styles/groundwork.css)
- [x] Fonts (Archivo / Geist / JetBrains Mono) in root head
- [x] Database schema + seed (wards, people, segments, polls, responses,
      messages, conversations, contributions, expenses, incidents, agents)
- [x] Accounts: email/password + Google, profiles, user_roles (admin/manager/agent)
- [x] Console shell: desktop sidebar, grouped mobile/tablet menu, routing per view
- [x] Access: sign-ups hold no data until an admin admits them (Team screen)

## Screens
- [x] Overview (exec)
- [x] Briefing
- [x] People (CRM)
- [x] Know your voters (map)
- [x] Polling + poll builder, launch/close, weighted results
- [x] Canvassing
- [x] Agents & stipends
- [x] Inbox
- [x] Broadcast & ads
- [x] Social & sentiment
- [x] Listening (web + TikTok/Reddit/YouTube via ScrapeCreators)
- [x] Finance (admin/manager, enforced in the database)
- [x] War room
- [x] Field app
- [x] Team
- [x] Brand & design

## Backend behaviour
- [x] Poll engine: create → launch → parse replies → record → weighted results
- [x] Outbox queue with consent re-check at send time (dry-run mode)
- [x] Public web poll page /p/:code
- [x] STOP/ACHA opt-out handling (SMS and USSD), START to rejoin
- [x] Phone normalisation + masking
- [x] USSD menu: answer a poll, volunteer, request a call-back, opt out
- [x] Double opt-in for web sign-ups (consent only on START)

## Going live (blocked on user)
- [ ] Africa's Talking credentials, then set AT_CALLBACK_TOKEN and point the SMS and
      USSD callbacks at /api/public/sms/inbound and /api/public/ussd
- [ ] Provider delivery in processOutbox (src/lib/outbox.server.ts) — the seam is there
- [ ] Schedule /api/public/outbox/drain every minute before setting CHANNELS_LIVE=true
- [ ] M-Pesa Daraja credentials (reward payouts)
- [x] WhatsApp +254 182 668723 connected: inbound to Inbox, replies, delivery/read ticks, STOP/START
- [ ] WhatsApp: set this project as Incoming messages destination (Connectors → WhatsApp); publish
- [x] WhatsApp template broadcasts wired into Broadcast
- [ ] Email: user sets up sender domain (Cloud → Emails), then alerts/app emails
- [ ] Custom domain groundwork.ke: ownership verified 25 Sep, all DNS records OK — user to complete setup in Project Settings → Domains (Check status), then SSL provisions; add www.groundwork.ke as a separate domain (A record already pointing to 185.158.133.1)

## Current
- [x] Group inbox categories, repair conversation rows, separate message timestamps/status and compact calling controls
- [x] Allow confirmed individual demo poll invitations without requiring stored WhatsApp consent; retain opt-outs and campaign isolation
- [x] Add individual WhatsApp/email poll recipients, consent checks, and invitation tracking; dialog and validation verified without sending
- [x] Upgrade Home readout voice and factual news-and-priorities format; verify playback and Stop
- [x] Multi-campaign: Kalonzo, Sakaja, Waruru Gikandi; per-campaign roles; Campaigns + invites
- [x] Campaign addresses connected; campaign-specific home and sign-in screens identify Kalonzo, Sakaja and Mathira
- [x] Chrome tab and installed-app icons shared across the main site and all campaign addresses
- [ ] Per-campaign WhatsApp/SMS numbers (all inbound goes to Sakaja for now)
- [ ] Map outline per campaign (Mathira/Kalonzo still show Nairobi base map)
- [x] Confirm the latest GitHub-synced changes are present in this workspace
- [ ] Rate limit /p/* at the edge (Cloudflare rule) before a web poll goes wide
