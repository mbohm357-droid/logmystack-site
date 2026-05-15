// LogMyStack — send-reminders Edge Function.
//
// Runs every 15 minutes via pg_cron. For each user with reminderPrefs.email
// or reminderPrefs.pushSubscribed set, computes their local time using their
// stored timezone, and if their reminder time falls inside the current 15-min
// window AND they haven't already been reminded today, sends:
//   - an email via Resend (if email reminders on)
//   - a web push via VAPID (if push subscribed)
//
// All "what was sent" state is tracked in user_data.data.reminderPrefs.lastSentAt
// so we never double-send on the same local day.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM    = Deno.env.get("RESEND_FROM") ?? "LogMyStack <reminders@logmystack.com>";
const VAPID_PUBLIC   = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE  = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT  = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@logmystack.com";
const SB_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET    = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL        = Deno.env.get("APP_URL") ?? "https://logmystack.com/app/";

const supabase = createClient(SB_URL, SB_SERVICE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  // Minimal auth check so only our cron (or you, when debugging) can fire this.
  if (CRON_SECRET) {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.includes(CRON_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const dryRun = new URL(req.url).searchParams.get("dry") === "1";

  // Pull every user_data row with either email or push enabled.
  const { data: rows, error } = await supabase
    .from("user_data")
    .select("user_id, data")
    .or("data->reminderPrefs->>email.eq.true,data->reminderPrefs->>pushSubscribed.eq.true");

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const now = new Date();
  const results = { considered: rows?.length ?? 0, emailsSent: 0, pushesSent: 0, skipped: 0, errors: 0, details: [] as any[] };

  for (const row of rows ?? []) {
    try {
      const prefs = row.data?.reminderPrefs;
      if (!prefs) { results.skipped++; continue; }

      const tz = prefs.timezone || "UTC";
      const time = prefs.time || "08:00";

      // Compute the user's "local now" using their stored IANA tz.
      const localNow = toZonedDate(now, tz);
      const localY = localNow.getFullYear();
      const localM = localNow.getMonth();
      const localD = localNow.getDate();
      const localMinutes = localNow.getHours() * 60 + localNow.getMinutes();

      const [h, m] = String(time).split(":").map(Number);
      const targetMinutes = (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0);

      // 15-min window around reminder time
      const inWindow = Math.abs(localMinutes - targetMinutes) < 15;
      if (!inWindow) { results.skipped++; continue; }

      // Already sent today (in user's local day)?
      if (prefs.lastSentAt) {
        const last = toZonedDate(new Date(prefs.lastSentAt), tz);
        const sameLocalDay =
          last.getFullYear() === localY && last.getMonth() === localM && last.getDate() === localD;
        if (sameLocalDay) { results.skipped++; continue; }
      }

      // Fetch the user's auth email (service role required).
      const { data: userResp, error: uErr } = await supabase.auth.admin.getUserById(row.user_id);
      if (uErr || !userResp?.user?.email) {
        results.errors++;
        results.details.push({ user_id: row.user_id, err: uErr?.message ?? "no email" });
        continue;
      }
      const email = userResp.user.email;
      const name = (row.data?.displayName || email.split("@")[0] || "you").toString();
      const streak = computeStreak(row.data);

      let sentEmail = false;
      let sentPush = false;

      if (prefs.email) {
        if (dryRun) {
          sentEmail = true;
        } else if (RESEND_API_KEY) {
          await sendEmail(email, name, streak);
          sentEmail = true;
          results.emailsSent++;
        }
      }

      if (prefs.pushSubscribed && prefs.pushSubscription) {
        if (dryRun) {
          sentPush = true;
        } else if (VAPID_PUBLIC && VAPID_PRIVATE) {
          await sendPush(prefs.pushSubscription, {
            title: streak > 0 ? `Keep your ${streak}-day streak alive` : "Time to log today",
            body: "Log your protocol today to keep the streak going.",
            data: { url: APP_URL },
          });
          sentPush = true;
          results.pushesSent++;
        }
      }

      // Mark sent so we don't double up later in the same local day.
      if (!dryRun && (sentEmail || sentPush)) {
        const newData = { ...row.data, reminderPrefs: { ...prefs, lastSentAt: now.toISOString() } };
        await supabase.from("user_data").update({ data: newData, updated_at: now.toISOString() }).eq("user_id", row.user_id);
      }

      results.details.push({ user_id: row.user_id, sentEmail, sentPush });
    } catch (e: any) {
      results.errors++;
      results.details.push({ user_id: row.user_id, err: String(e?.message ?? e) });
    }
  }

  return jsonResponse(results, 200);
});

function jsonResponse(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Convert a Date to a Date instance representing the same wall clock in the
// target IANA timezone. Note: the resulting Date's UTC values are unreliable,
// but its get* (local) accessors return the correct numbers for that tz.
function toZonedDate(date: Date, tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce((acc: Record<string, string>, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
}

function computeStreak(data: any): number {
  const events = [
    ...(data?.doses ?? []),
    ...(data?.notes ?? []),
    ...(data?.checkins ?? []),
  ];
  if (events.length === 0) return 0;
  const dates = new Set(events.map((e: any) => (e.timestamp || e.date || "").slice(0, 10)));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (dates.has(iso)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

async function sendEmail(to: string, name: string, streak: number): Promise<void> {
  const subject = streak > 0
    ? `Keep your ${streak}-day streak alive`
    : "Time to log today's stack";

  const streakBlock = streak > 0
    ? `<p style="color:#34d399;font-weight:600;margin:0 0 16px;font-size:14px;">${streak}-day streak — log today to keep it going.</p>`
    : `<p style="color:#a3a3a3;margin:0 0 16px;font-size:14px;">A fresh day. Log your first thing and start a streak.</p>`;

  const html = `<!doctype html>
<html><body style="background:#0a0a0a;color:#fafafa;font-family:-apple-system,Inter,sans-serif;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#111;border:1px solid #262626;border-radius:16px;padding:28px;">
    <div style="margin-bottom:24px;">
      <span style="background:#34d399;padding:3px 9px;border-radius:5px;font-size:10px;font-weight:700;color:#052e1a;letter-spacing:0.12em;text-transform:uppercase;font-family:'JetBrains Mono',monospace;">LogMyStack</span>
    </div>
    <h1 style="font-size:22px;margin:0 0 10px;letter-spacing:-0.015em;">Hi ${escapeHtml(name)},</h1>
    <p style="color:#a3a3a3;margin:0 0 6px;font-size:14px;">Your daily reminder to log today's protocol.</p>
    ${streakBlock}
    <a href="${APP_URL}" style="display:inline-block;background:#34d399;color:#052e1a;padding:11px 22px;border-radius:10px;font-weight:600;text-decoration:none;font-size:14px;">Open LogMyStack →</a>
    <p style="color:#737373;font-size:11px;margin:32px 0 0;font-family:'JetBrains Mono',monospace;letter-spacing:0.04em;">
      You're getting this because email reminders are on. <a href="${APP_URL}" style="color:#34d399;text-decoration:none;">Settings → Reminders</a> to change.
    </p>
  </div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

async function sendPush(subscription: any, payload: any): Promise<void> {
  // web-push from npm; Deno supports `npm:` imports in Supabase Edge runtime.
  const mod: any = await import("npm:web-push@3.6.7");
  const webpush = mod.default ?? mod;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string)
  );
}
