# Campaign-specific home and sign-in screens

## What will change
- Detect `sakaja.groundwork.ke`, `kalonzo.groundwork.ke`, and `mathira.groundwork.ke` from the address.
- Show a campaign-specific first screen with the campaign name, candidate, seat, and a clear sign-in action instead of the general Groundwork sales homepage.
- Strengthen the matching sign-in screen so the campaign identity is the main heading, while retaining Groundwork as the platform brand.
- Keep `groundwork.ke` as the general Groundwork website and preserve its demo, product, pricing, and contact content.
- Keep the existing campaign membership and role restrictions unchanged.

## Experience
- Campaign address: campaign name and seat are visible immediately; sign-in stays on that campaign’s address.
- Main address: the existing Groundwork homepage remains unchanged.
- Unknown campaign address: fall back safely to the general Groundwork experience rather than showing another campaign.
- Phone and tablet layouts remain compact and readable.

## Technical details
- Reuse the existing public campaign lookup; no campaign data will be exposed beyond name, candidate, and seat.
- Resolve branding from the hostname, not saved browser state, so visiting the main site cannot accidentally show a previously opened campaign.
- Add route metadata appropriate to the campaign-aware entry screen where runtime hostname data permits, while preserving the existing page metadata fallback.
- Verify the general homepage plus Sakaja, Kalonzo, and Mathira variants at desktop and mobile widths.
