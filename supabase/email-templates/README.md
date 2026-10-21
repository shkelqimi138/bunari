# Authentication email templates

These templates are live: Supabase sends them through Resend (`Bunari <noreply@bunari.app>`, SMTP `smtp.resend.com`, click and open tracking off). After changing a file here, paste it into Supabase again.

In the Supabase dashboard, open Authentication › Emails. Paste each file into its matching template and set its subject:

| Template | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | `Confirm your Bunari account` |
| Reset password | `reset-password.html` | `Reset your Bunari password` |
| Change email address | `change-email.html` | `Confirm your new email address` |
| Security notification: Password changed (turn it on) | `password-changed.html` | `Your Bunari password was changed` |
| Security notification: Email address changed (turn it on) | `email-changed.html` | `Your Bunari email address was changed` |

The other Supabase templates (magic link, invite, reauthentication, and the phone, identity and MFA notifications) are not used by Bunari.

Variables (Supabase's names): `{{ .ConfirmationURL }}` is the link in the first three, written after `https://bunari.app/link#` so it opens the website's Continue page first: email scanners that open links to check them then cannot use up the one-time link ("expired or already used", 2026-10-07), and the real link opens only when the person taps Continue (`website/link.html`, `website/link.mjs`); `{{ .NewEmail }}` is the new address in Change email address; `{{ .Email }}` is the account's address (after a change, the new one) and `{{ .OldEmail }}` the previous one in Email address changed.

Every email names Bunari, links to https://bunari.app, and gives contact@bunari.app for questions; the three with a button say to open them on the iPhone with Bunari, because the button opens the app. `tests/email-templates.test.mjs` checks this. The templates use the warm light colours of the app and the website, inline styles only (email apps ignore style sheets), and the final product name `Bunari`.
