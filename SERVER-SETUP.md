# Server-side reminders — setup checklist

After you push the code, do these one-time steps to turn on the reminder system. Total time: ~30 minutes.

You'll be doing:

1. Generate VAPID keys for web push
2. Sign up for Resend and verify your sending domain
3. Set Supabase secrets
4. Deploy the `send-reminders` Edge Function
5. Run the cron migration

---

## 1 · Generate VAPID keys for web push

In any terminal:

```sh
npx web-push generate-vapid-keys
```

You'll get two strings:

```
Public Key:  BCw...kLM
Private Key: rWQ...x7Y
```

**Hold onto both.** The public key goes in the client, the private key goes into Supabase secrets.

---

## 2 · Sign up for Resend (email)

1. Go to [resend.com](https://resend.com) → sign up.
2. **Domains** → Add Domain → `logmystack.com`.
3. Resend gives you DNS records (DKIM, MX-equivalent, etc.). Add them to your DNS provider (Vercel, Cloudflare, wherever). It takes 5-30 minutes for Resend to verify.
4. **API Keys** → create one with "Sending access" → copy the key.

(You can swap Resend for Postmark, SendGrid, or anything else with a REST email API later — just change `sendEmail()` in `supabase/functions/send-reminders/index.ts`.)

---

## 3 · Set Supabase secrets

In Supabase dashboard → Project Settings → Edge Functions → **Add new secret**, set these one-by-one:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | the API key from Resend |
| `RESEND_FROM` | `LogMyStack <reminders@logmystack.com>` (must match a verified Resend domain) |
| `VAPID_PUBLIC_KEY` | your VAPID public key from step 1 |
| `VAPID_PRIVATE_KEY` | your VAPID private key from step 1 |
| `VAPID_SUBJECT` | `mailto:hello@logmystack.com` |
| `CRON_SECRET` | a random string you make up — used to authenticate cron calls. Generate via `openssl rand -hex 32` |
| `APP_URL` | `https://logmystack.com/app/` |

Then, **separately, in Database → Vault**, store the cron-related values so pg_cron can read them:

| Vault secret | Value |
|---|---|
| `project_url` | `https://axnlmmxkydsrqrshlenz.supabase.co` (your project URL, no trailing slash, no `/functions/...`) |
| `cron_secret` | same string you set as `CRON_SECRET` above |

---

## 4 · Put the VAPID public key in the client

Open `app/index.html` and find this line near the top of the main `<script>` block:

```js
const VAPID_PUBLIC_KEY = '';
```

Paste your VAPID **public** key between the quotes:

```js
const VAPID_PUBLIC_KEY = 'BCw...kLM';
```

Commit + push that single-line change. Until you set this, users can still get email reminders, but browser push subscriptions won't go through (the client just logs a console warning).

---

## 5 · Deploy the Edge Function

You need the Supabase CLI. If you don't have it:

```sh
brew install supabase/tap/supabase
```

Then from the repo root:

```sh
supabase login
supabase link --project-ref axnlmmxkydsrqrshlenz   # your project ref (from project URL)
supabase functions deploy send-reminders
```

To check it's live:

```sh
# Dry-run (no emails sent, no DB updates):
curl "https://axnlmmxkydsrqrshlenz.supabase.co/functions/v1/send-reminders?dry=1" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

You should see a JSON response like `{"considered":2,"emailsSent":0,"pushesSent":0,...}`.

For real (will send actual emails if anyone has email reminders on + their time window is now):

```sh
curl "https://axnlmmxkydsrqrshlenz.supabase.co/functions/v1/send-reminders" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## 6 · Schedule the cron

In Supabase dashboard → SQL Editor, paste the contents of `supabase/migrations/20260514000000_reminders_cron.sql` and run it. It:

1. Enables `pg_cron` and `pg_net` if not already.
2. Schedules `lms-send-reminders` to run every 15 minutes.
3. Uses the vault secrets `project_url` and `cron_secret` you set in step 3.

Verify it's scheduled:

```sql
select * from cron.job where jobname = 'lms-send-reminders';
```

You should see one row with a `*/15 * * * *` schedule.

---

## How it works (debug map)

- **Trigger:** pg_cron fires every 15 minutes.
- **Authentication:** cron sends `Authorization: Bearer <CRON_SECRET>` to the Edge Function. Function rejects if it doesn't match.
- **Selection:** function queries `user_data` rows where `data.reminderPrefs.email = true` OR `data.reminderPrefs.pushSubscribed = true`.
- **Filtering:** for each user, computes their local time using `data.reminderPrefs.timezone`. If `reminderTime ± 15min` doesn't include "now", skip. Also skip if `reminderPrefs.lastSentAt` is in the same local day.
- **Sending:** email via Resend, push via web-push npm (VAPID).
- **Mark sent:** writes `reminderPrefs.lastSentAt = <iso>` back to `user_data`.

## To verify a friend gets a reminder

1. Have them sign in to `/app/`, go to Settings, turn on email reminders, set reminder time to e.g. "10 minutes from now".
2. Wait for the next 15-min cron tick (or trigger manually with the `curl` above).
3. They should receive the email within a minute.

## Common issues

- **No email arrives:** check Resend dashboard → Logs. If you see "Domain not verified," your DNS hasn't propagated yet.
- **Cron rows not appearing:** make sure `pg_cron` and `pg_net` are enabled in Database → Extensions.
- **401 from Edge Function:** `CRON_SECRET` env var and `cron_secret` vault secret must match exactly.
- **Push subscription fails on client:** check `VAPID_PUBLIC_KEY` is set in `app/index.html` and matches the one in Supabase secrets.
- **Re-sending too often:** the function uses `lastSentAt` in the user's local day. If a user's timezone is wrong, they'll get up to one re-send when the date flips locally.

## Where each file lives

| File | Purpose |
|---|---|
| `supabase/functions/send-reminders/index.ts` | The Deno Edge Function — runs every 15 min |
| `supabase/migrations/20260514000000_reminders_cron.sql` | pg_cron schedule |
| `app/index.html` (top of `<script>`) | `VAPID_PUBLIC_KEY` constant |
| `app/index.html` (`enablePushNotifications`, `subscribeToPush`) | Client subscribes to PushManager |
| `sw.js` (`push` + `notificationclick` handlers) | Receives + displays pushes |

## To turn it off temporarily

```sql
select cron.unschedule('lms-send-reminders');
```

To turn it back on, re-run the migration in step 6.
