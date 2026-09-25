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
- [x] Console shell: sidebar, mobile topbar, routing per view
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
- [x] Listening
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
- [ ] WhatsApp templates for broadcasts (Meta approval)
- [ ] Email: user sets up sender domain (Cloud → Emails), then alerts/app emails
- [ ] Custom domain: user connecting it themselves

## Current
- [x] Confirm the latest GitHub-synced changes are present in this workspace
- [ ] Rate limit /p/* at the edge (Cloudflare rule) before a web poll goes wide
