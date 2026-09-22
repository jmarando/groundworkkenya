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

## Screens (port from the original console)
- [x] Overview (exec)
- [ ] People (CRM)
- [ ] Know your voters (map)
- [ ] Polling + poll builder
- [ ] Inbox
- [ ] Broadcast & ads
- [ ] Listening
- [ ] Finance
- [ ] War room
- [ ] Field app
- [ ] Brand & design

## Backend behaviour
- [ ] Poll engine: create → launch → parse replies → record → weighted results
- [ ] Outbox queue with consent re-check at send time (dry-run mode)
- [ ] Public web poll page /p/:code
- [ ] STOP/ACHA opt-out handling
- [ ] Phone normalisation + masking

## Later (blocked on user)
- [ ] Africa's Talking SMS/USSD credentials
- [ ] M-Pesa Daraja credentials
- [ ] WhatsApp (policy risk; off by default)
