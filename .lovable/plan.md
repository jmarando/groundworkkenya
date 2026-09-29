# Email in the Inbox + per-campaign channel onboarding

## What you get
1. **Email in the unified Inbox.** Staff can start or answer an email conversation from the Inbox, the same way as WhatsApp. When the person replies, the reply lands back in the same thread, with sentiment and issue tags.
2. **Each campaign has its own addresses.** For example, Sakaja sends as `Sakaja 2027 <sakaja@notify.groundwork.ke>`, and replies come back to `sakaja@in.groundwork.ke`. Replies are sorted to the right campaign by the address they were sent to.
3. **A "Channels" step when onboarding a campaign.** Each campaign gets a checklist on its Campaigns card: WhatsApp number, SMS sender name, email address, Facebook Page, Instagram and X. Each item shows whether it is not started, waiting on the provider, or live. It also has a short guided form with the exact value to paste into the provider's dashboard.
4. **Everything coming in is sorted by campaign.** A WhatsApp number, Facebook Page, email address or SMS short code identifies its campaign. A message to Kalonzo's page can never land in Sakaja's Inbox.

## Limits to know
- **Receiving email needs one extra service.** The sending side only sends. For receiving, the assumption is **Postmark Inbound**: it has a free tier and posts each incoming email to the app. You would create a Postmark account and add one MX record for `in.groundwork.ke`. Mailgun or SendGrid also work if you prefer.
- **One-to-one only.** Emails go to one person at a time, as Inbox replies and conversations. Mass email newsletters aren't supported on this sender. They would need a dedicated marketing email service.
- **WhatsApp for other campaigns.** Each campaign's number has to be added under the same Meta business account as the current connection. Otherwise it needs its own connection. The checklist explains both options.
- **SMS.** One Africa's Talking account can carry a separate approved sender name for each campaign.

## Build order
1. Campaign channels register and routing by identifier; move WhatsApp and Meta routing onto it.
2. Outbound email from the Inbox, with per-campaign "from" and reply-to addresses.
3. Inbound email receiver, turned on once the Postmark key and MX record are in place.
4. Channels checklist in campaign onboarding.

## Technical details
- New table `campaign_channels` (campaign_id, kind `whatsapp|sms|email|facebook|instagram|x`, identifier such as phone_number_id, page_id, email local-part or AT shortcode, display, status `not_started|pending|live`, note). Unique on (kind, identifier), with GRANTs, RLS, the restrictive own-campaign policy, and super admin or can_admit for writes.
- `channel_campaign()` is replaced by `campaign_for_channel(kind, identifier)`. The WhatsApp, Meta and AT receivers look up the campaign from the payload's identifier. It falls back to the `owns_channels` campaign so current flows keep working.
- Outbound: scaffold transactional email, then a `replyByEmail` / `startConversation(channel:'email')` server function. It calls `sendLovableEmail` with `from` set to the campaign's display name at notify.groundwork.ke and `reply_to` set to `<slug>+<conversationId>@in.groundwork.ke`. It stores a `messages` row with `channel='email'`.
- Inbound: route `src/routes/api/public/email/inbound.ts`. It checks a Basic-auth token (`EMAIL_INBOUND_TOKEN`), parses the Postmark JSON and strips quoted history. It resolves the campaign and conversation from the plus-address, then upserts the person by email. `people` gets a nullable `email` column, unique per campaign. It classifies sentiment with the existing classifier.
- An email events receiver marks bounced or complained addresses on the person, as a notice only.
- Auth-email reply-to goes to the campaign's inbound address.
- Secrets requested when needed: `POSTMARK_SERVER_TOKEN` is optional, `EMAIL_INBOUND_TOKEN` is generated.
