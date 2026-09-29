# Invite-only sign-in, scoped per campaign

## What changes
- **No public sign-up.** The "No account yet? Create one" link goes away on every sign-in screen, and account creation is switched off, so nobody can register themselves, including through Google.
- **Accounts come from the Team screen only.** The candidate, the campaign manager or a super admin enters a name, an email and a role. The person gets an email: "You've been invited to Sakaja 2027. Set your password."
- **Set-password page.** The link in the email opens a page on that campaign's own address (for example sakaja.groundwork.ke/set-password). There they choose a password and go straight into the console.
- **Forgot password.** The sign-in screen gets a "Forgot password?" link. It sends a reset email that opens the same set-password page.
- **Google stays** for people who already have an account under the same email.
- **Super admins** can invite a campaign's first candidate from the Campaigns screen, as they can now.

## How it is scoped to each campaign
- Each invite belongs to one campaign and one role, and is stored in the database.
- The invite email links to that campaign's own address, so sakaja invites land on sakaja.groundwork.ke.
- When the person sets their password, they become a member of that campaign only, with the role they were invited with.
- If they sign in at another campaign's address, they see "You're not part of this campaign" and get no data. This already works today and is enforced in the database.

## Technical details
- Auth config: `disable_signup: true`. Admin invites still work while it is on.
- New server function `inviteTeamMember`: checks `can_admit` for the caller, writes `campaign_invites`, then calls `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: https://<campaign host>/set-password, data: { full_name } })`. Existing users are added directly through `invite_member`.
- `handle_new_user` already turns an invite into a membership. No schema change needed.
- New public route `/set-password`: reads the invite or recovery session, then calls `updateUser({ password })` and navigates to `homeFor(role)`.
- `/auth`: remove the sign-up mode, add `resetPasswordForEmail` with `redirectTo` set to the current host's `/set-password`.
- Team screen: the invite form uses the new function and shows "Invite sent". Add a "Resend invite" action for pending invites.
- Invite emails use the built-in auth emails for now. Branded emails can follow once the email domain is set up.
