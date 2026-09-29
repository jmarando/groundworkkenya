# Campaign websites, built into Groundwork

Status: approved 2026-09-28 (built into Groundwork; donations both by Paybill and by an
M-Pesa prompt; start at a Groundwork address, own domain later). Updated 2026-09-29 for
multi-campaign workspaces.

## Why

Candidates need a campaign site that loads on a cheap phone over 2G, that their team can
update in minutes without a developer, and whose sign-ups and donations land in the
campaign's own records with consent handled properly. Building it into Groundwork gives
all three: one login, one voter file, one consent rule.

## Address

Each campaign's site lives at `groundwork.ke/s/<campaign slug>`: `<slug>.groundwork.ke`
is already the campaign's console. Part 3 adds the campaign's own domain.

## What the team edits (the Website screen)

Sections, each in English and Swahili, each can be switched off:

- **Hero**: headline, one line under it, a photo, Join and Donate buttons.
- **Our story**: a few paragraphs and a photo.
- **Agenda**: up to six pillars, each with up to five commitments.
- **Events**: date, time, place, what it is.
- **Updates**: short posts with an optional photo, newest first.
- **Volunteer**: a short pitch above the sign-up form.
- **Donate**: the Paybill number and account, or a Till number, with how to give.
- **Contact**: office, phone, WhatsApp, email, social links.

Look: three templates (Bold, Classic, Minimal) and two colours, primary and accent.
Button text is black or white, whichever reads better on the chosen colour.

The phone-sized preview uses the same renderer as the public site, so what the team sees
is what visitors get. Candidates and campaign managers edit and publish; the rest of the
team can look. Each publish is kept (the last 20), and any of them can be restored to the
draft.

## What visitors get

- **Plain pages**, like the poll pages: server-rendered HTML with inline CSS and no
  JavaScript, system fonts, photos lazy-loaded at a sensible size. English by default,
  `?lang=sw` for Swahili, a link at the top to switch.
- **Volunteer form**: name, phone, ward (the campaign's own wards), and what they can help
  with (doors, calls, events, polling-day agent). The person lands in the campaign's
  People list, tagged Volunteer and with what they offered; consent counts only after
  they reply START to the confirmation text, the same double opt-in as the poll pages.
  The team gets an inbox conversation. A hidden trap field, a minimum fill time, 60
  sign-ups per ten minutes per connection, and one confirmation text per number per day
  keep it from being turned on strangers.
- **Donate**: the Paybill and account (or Till) with plain instructions. Part 2 adds
  "send me a payment prompt".
- **Privacy notice** at `/s/<slug>/privacy`, written from what the site collects, who
  sees it, and how to leave (STOP), as the Data Protection Act asks.
- Unpublished sites answer 404; published ones carry title, description and share image.

## Data

- `campaign_sites`: one per campaign. `draft` and `published` content (jsonb),
  `published_at`/`published_by`, `updated_at`/`updated_by`. Campaign-scoped like every
  campaign table (own-campaign policy); the team reads, candidate and manager write.
- `site_versions`: each published snapshot, newest 20 kept.
- `publish_site()` and `restore_site_version()` do the copying in the database, staff only.
- Photos in Storage bucket `site-media`, public to read, path
  `<campaign id>/<random>.jpg`. The browser shrinks photos to 1,280 px JPEG; the server
  checks the sender is the campaign's candidate or manager and that the file is a JPEG
  under 2 MB, then saves it with the service role. No browser writes to the bucket (the
  database user that applies migrations cannot add storage policies anyway).
- The public page reads `published` with the server's service role; drafts never leave
  the console.

## Safety of what is published

Everything the team types is escaped when rendered. Links must be `https://`; phone
numbers are normalised; colours must be `#rrggbb`. The public page sends a strict
Content-Security-Policy: no scripts, images only from Groundwork and its storage.

## Parts

1. Editor, published site, volunteer form, Paybill/Till, photos, privacy notice.
2. M-Pesa payment prompt (Daraja STK push): phone and amount, a declaration (Kenyan
   citizen, own money), a campaign maximum per donation, rate limits per phone and per
   connection; Safaricom's confirmation checked with a status query before the donation
   is recorded in Finance with the receipt; a thank-you text. Dry run until the Daraja
   credentials are set.
3. "Draft with AI" and English/Swahili translation per field; the campaign's own domain.

## Testing

SQL: the team reads its own site only; only candidate or manager write, publish and
restore; publishing keeps a version and trims to 20; another campaign can't read a
draft. TypeScript: the renderer escapes input, honours switched-off sections and
language, picks readable button text; content cleaning drops bad links and colours; the
volunteer handler records the person in the site's campaign and asks for consent, with a
stand-in database. A visual check of each template in the preview harness, desktop and
phone.
