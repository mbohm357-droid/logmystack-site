# Deploying logmystack.com

End-to-end guide: from these files → live on `logmystack.com` with HTTPS. ~25 minutes first time.

---

## What you're shipping

```
logmystack-site/
├── index.html              ← landing page (logmystack.com)
├── calc/
│   └── index.html          ← reconstitution calculator (logmystack.com/calc)
├── vercel.json             ← hosting config (clean URLs, security headers)
├── robots.txt              ← tells search engines they're welcome
├── sitemap.xml             ← helps Google index both pages
├── .gitignore              ← keeps junk files out of Git
└── DEPLOY.md               ← this file
```

---

## Part 1 — Put it on GitHub (10 min)

### 1.1 Create a GitHub account (skip if you have one)

Go to https://github.com/signup. Use a real username you're OK with being public (it'll appear in your repo URL).

### 1.2 Install GitHub Desktop

Easiest path for non-CLI users: https://desktop.github.com. Open it, sign in with the account you just made.

### 1.3 Create the repo

In GitHub Desktop:
1. **File → New Repository**
2. Name: `logmystack-site`
3. Local path: wherever you want it on your machine (e.g. `~/Documents/`)
4. Description: `logmystack.com — landing page + reconstitution calculator`
5. Initialize with README: **unchecked** (we'll add files next)
6. Git ignore: **None** (we have our own)
7. License: **None** for now (you can add MIT or similar later)
8. Click **Create Repository**

### 1.4 Drop the files in

1. Finder → open the folder GitHub Desktop created
2. Copy everything from this `logmystack-site/` folder *into* that folder:
   - `index.html`
   - `calc/` (whole folder)
   - `vercel.json`
   - `robots.txt`
   - `sitemap.xml`
   - `.gitignore` (make sure hidden files are visible: `Cmd+Shift+.` in Finder)
   - (skip `DEPLOY.md` if you don't want it public — or include it, your call)

### 1.5 Commit and push

Back in GitHub Desktop:
1. You'll see all the new files listed on the left
2. In the bottom-left, summary: `Initial commit — landing page + calculator`
3. Click **Commit to main**
4. Click **Publish repository** at the top
5. Keep the repo **public** (or private — Vercel works with both)
6. Click **Publish repository**

Your code is now at `https://github.com/<your-username>/logmystack-site`.

---

## Part 2 — Deploy to Vercel (5 min)

### 2.1 Sign up

Go to https://vercel.com/signup. **Use "Continue with GitHub"** — this auto-connects your GitHub account so Vercel can read your repos.

### 2.2 Import the repo

1. On the Vercel dashboard, click **Add New → Project**
2. Find `logmystack-site` in the list, click **Import**
3. Framework Preset: **Other** (Vercel should auto-detect static HTML)
4. Root Directory: leave as `./`
5. Build & Output Settings: leave default (no build command needed for static HTML)
6. Click **Deploy**

Wait ~30 seconds. You'll get a URL like `logmystack-site-abc123.vercel.app`. Click it. You should see your landing page. Click "Calculator" — `/calc` should load.

**If the calculator loads but styles are broken**, hard-refresh (Cmd+Shift+R) to clear the browser cache.

---

## Part 3 — Point logmystack.com at Vercel (10 min + DNS wait)

### 3.1 Add the domain in Vercel

1. In your Vercel project → **Settings → Domains**
2. Type `logmystack.com` → **Add**
3. Vercel will tell you to also add `www.logmystack.com` — do it (it'll auto-redirect to the apex)
4. Vercel will now show you the DNS records to add. It'll look like:
   - **Type:** A · **Name:** @ · **Value:** `76.76.21.21`
   - **Type:** CNAME · **Name:** www · **Value:** `cname.vercel-dns.com`

Keep this tab open.

### 3.2 Add the records in GoDaddy

1. Go to https://dcc.godaddy.com/domains → sign in
2. Click **logmystack.com** → **DNS**
3. You'll see a list of existing DNS records. You need to do three things:

**a) Delete GoDaddy's parking records.**
- Delete the existing `A` record where Name is `@` (points to a GoDaddy parking IP)
- Delete the existing `CNAME` record where Name is `www` (points to `@`)
- Leave the `NS` and `SOA` records alone — don't touch those.

**b) Add the A record.**
- Click **Add New Record** (or the "+" button)
- Type: **A**
- Name: **@**
- Value: **76.76.21.21** (or whatever IP Vercel showed you — confirm)
- TTL: **1 Hour** (or default)
- Save

**c) Add the CNAME record.**
- Add New Record
- Type: **CNAME**
- Name: **www**
- Value: **cname.vercel-dns.com** (paste exactly, no trailing dot)
- TTL: 1 Hour
- Save

### 3.3 Wait for DNS to propagate

DNS changes take anywhere from 5 minutes to a few hours (usually ~15 min on GoDaddy). While you wait:

- Keep refreshing the Vercel **Settings → Domains** page
- `logmystack.com` will show a spinner, then a green checkmark when Vercel sees the correct records
- Once it's green, Vercel automatically provisions an SSL certificate — a few more minutes
- Then you're live at `https://logmystack.com`

You can check DNS progress externally at https://dnschecker.org/#A/logmystack.com — it'll show the new IP propagating globally.

---

## Part 4 — Verify everything

Once Vercel shows the green checkmark:

1. `https://logmystack.com` → landing page loads over HTTPS
2. `https://www.logmystack.com` → redirects to `https://logmystack.com`
3. `https://logmystack.com/calc` → calculator loads
4. Try the calculator: click BPC-157 preset, verify it shows 20 units. Click Tirzepatide, verify it shows 50 units + the help note.
5. On mobile: pull up both pages on your phone. Everything should be responsive.

---

## Part 5 — Making future changes

Because the repo is connected to Vercel, **every push to `main` auto-deploys** to logmystack.com within ~30 seconds. To make an edit:

1. Open the file in GitHub Desktop's "Current Repository" folder
2. Edit in whatever editor you prefer (VS Code is free: https://code.visualstudio.com)
3. Save
4. In GitHub Desktop, write a commit message, click **Commit to main**
5. Click **Push origin**
6. Wait 30 seconds. Refresh logmystack.com — your change is live.

---

## What's not done yet (parking lot)

- **Waitlist form is a stub.** Currently just shows "You're on the list" and does nothing. Wire it to a real service before launch:
  - **ConvertKit** (best for a real email list): free up to 10,000 subscribers
  - **Buttondown** (developer-friendly newsletter tool): $9/mo
  - **Google Form** (fastest, ugliest): free, redirect the form action to a Google Form URL
  - **Resend + Supabase table**: if you want full control
- **Analytics.** Add PostHog (per the engineering brief) or Plausible (simpler, privacy-friendly $9/mo). Drop the script tag in both `index.html` files once you pick one.
- **Legal pages.** Add `/privacy` and `/terms` before accepting email signups in volume. Peptide-aware lawyer review recommended (we discussed this earlier).
- **Favicon.** The little icon in the browser tab. Make one with your hexagon logo at https://realfavicongenerator.net.
- **OG image.** For link previews when you share logmystack.com on Reddit/Twitter. 1200×630 px, matches the dark aesthetic.

---

## Troubleshooting

**"Domain is pointing to the wrong website" in Vercel.**
GoDaddy still has an old A or CNAME record. Go back to the DNS page and delete any leftover records for `@` or `www` that don't match the Vercel values.

**"SSL certificate pending" for more than an hour.**
DNS hasn't fully propagated. Wait another 30 min. If still stuck, check DNSchecker for `logmystack.com` A record — it should be `76.76.21.21` everywhere.

**The calculator shows a white background.**
Hard-refresh (Cmd+Shift+R) — the browser is serving a cached old version. Or clear site data in dev tools.

**Anything else.**
Drop me a screenshot and I'll diagnose.
