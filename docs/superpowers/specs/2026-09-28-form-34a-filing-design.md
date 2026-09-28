# Form 34A filing by polling agents

Status: approved 2026-09-28 (first election-day slice: results; USSD and WhatsApp, no login).

## Why

The live war room already tallies whatever sits in `polling_stations.results`, but
nothing puts results there. On election night each polling agent has the signed
Form 34A for their stream in hand. They need to get the counts and a photo of the
form to the war room within minutes, from any phone, without an account.

## Who files

A polling agent is the phone number on their station (`polling_stations.agent_phone`).
The network vouches for the number on USSD and WhatsApp, so no login is needed.
Staff assign agents on the Agents page: name and phone per station. Assigning marks
the station staffed; clearing the phone marks it unstaffed.

## The ballot

`ballot_candidates`: position (the order agents key votes in), name, party, and
whether it is our candidate. Staff set it in the war room (live mode). Once the
first form is filed the order is locked: names and parties can still be corrected,
candidates cannot be added, removed or moved, so earlier filings keep their meaning.

## Filing on USSD

The existing menu gains `5. Fomu 34A (ajenti)` for callers whose number is on a
station. Screens are plain ASCII (GSM-7) and at most 182 characters.

1. Which station, only if the number is on more than one.
2. Which stream, only if the station has more than one.
3. Votes for each candidate, in ballot order.
4. Rejected ballots.
5. Review: every count, the total, then `1. Tuma` (send) or `2. Futa` (discard).
6. Receipt, and how to send the photo on WhatsApp: `34A PS-0001/2`.

A bad entry ends the session with the reason; the agent dials again. USSD carries
the whole path in each request, so the flow is a pure function of the inputs.

## What the database checks

`file_stream_result` (service role only):

- the number is the station's agent, the stream exists, one count per candidate;
- valid plus rejected is not more than the station's registered voters (refused);
- a second filing for the same stream supersedes the first and is marked corrected;
- the station's streams together above its register is flagged for review, not refused;
- the station's roll-up (`results`, `reported_at`) is recomputed from current filings,
  so the war room's tally, coverage and constituency table work unchanged.

## Photos on WhatsApp

An image from an agent's number is recorded in `form_photos` against their station.
The stream comes from the caption (`34A PS-0001/2`, `PS-0001/2`, `mkondo 2`,
`stream 2`), else the agent's latest filed stream still without a photo. The agent
gets a WhatsApp reply confirming which stream it was matched to, or asking them to
say. The image itself stays in the campaign's WhatsApp: Lovable's connector does not
document downloading media, so the war room shows "photo received" with the time.

## War room

- Form 34A card: streams filed of streams to cover, photos received, the latest
  filings (station, stream, time, total, photo, corrected).
- Flags for review: streams above the register, corrected filings, filings with no
  photo after 30 minutes.
- Ballot card: the candidates in order; staff can edit until the first filing.

## Not in this slice

Turnout check-ins, incidents by USSD, staff corrections from the console, SMS
fallback, downloading photos into Groundwork.
