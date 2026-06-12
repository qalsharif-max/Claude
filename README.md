# 🛂 Document Expiry Tracker

A small self-hosted web app to track visas, passports, and other important
documents for your family — and email you reminders **6 months before** each one
expires, then **every month after that** until you upload the replacement.

Your six family members are pre-loaded as document owners:
Qutaibah Alsharif (Father), Yasminah Hashim (Mother), Malak Alsharif (Daughter),
Omar Alsharif (Son), Lama Alsharif (Daughter), Taliah Alsharif (Daughter).

## Features

- 🔐 Single-password login to protect your documents.
- 👨‍👩‍👧‍👦 Track multiple documents per person (type, number, country, issue/expiry dates, notes).
- 📎 Upload a scan or photo (PDF/image) of each document.
- 🚦 At-a-glance status: **Valid**, **Expiring soon**, **Expired**.
- 🗓️ **Hijri & Gregorian dates** — enter a Saudi document's Hijri expiry directly
  (Umm al-Qura) and it's converted to Gregorian automatically; both are shown.
- 📧 Automatic email reminders via [Resend](https://resend.com): first at 6 months
  out, then monthly until you renew.
- ☁️ **Auto-import from Google Drive (or Dropbox)** — drop a scan in a folder and the
  app pulls it in, reads the expiry date with Claude (incl. Hijri), and queues it
  for a quick review before any reminders fire.
- ♻️ Uploading a new file or changing the expiry date resets the reminder cycle.
- 🕘 Built-in daily scheduler — no separate cron needed (but one is supported too).

## Quick start

```bash
# 1. Install dependencies (Node.js 18.17+ required)
npm install

# 2. Create your config from the template
cp .env.example .env

# 3. Edit .env and set, at minimum:
#    APP_PASSWORD     – the password you'll log in with
#    SESSION_SECRET   – a long random string (command to generate one is in the file)
#    RESEND_API_KEY   – your Resend key (optional at first; see "Email" below)
#    EMAIL_TO         – where reminders should be sent

# 4. Start it
npm start
```

Then open **http://localhost:3000** and log in with your `APP_PASSWORD`.

## Email setup (Resend)

The Resend API key lives in your **`.env`** file (never committed to git):

1. Create a free account at <https://resend.com>.
2. Go to **API Keys → Create API Key** and copy the value (it starts with `re_`).
3. Put it in `.env`:
   ```
   RESEND_API_KEY=re_your_key_here
   EMAIL_FROM=Document Reminders <onboarding@resend.dev>
   EMAIL_TO=q.alsharif@gmail.com
   ```
4. Restart the app.

> **Before you add a key**, the app runs in **log-only mode**: reminders are
> printed to the server console instead of being emailed, so you can try
> everything first. The Settings screen shows which mode you're in, and has a
> **Send test email** button.

> To reliably send to your own inbox (not just the Resend sandbox), verify your
> own domain in Resend and set `EMAIL_FROM` to an address on that domain.

## Auto-import from Google Drive (optional)

Instead of uploading each document by hand, point the app at a cloud folder. On
every daily run (and via the **Sync now** button) it pulls new/changed files,
reads each one with Claude to extract the expiry date — **including Hijri dates,
which are converted to Gregorian automatically** — and adds it as a **"Needs
review"** document. Nothing sends a reminder until you open it, check the details,
and confirm. A misread date can never silently drive a reminder.

You can use **Google Drive** (recommended) or **Dropbox**. If both are configured,
Google Drive wins.

### Google Drive setup (service account)

1. In the [Google Cloud Console](https://console.cloud.google.com), create a
   project and **enable the Google Drive API**.
2. Create a **Service Account**, then create a **JSON key** for it and download it.
3. **Share your Drive folder** with the service account's email address
   (the `client_email` in the JSON), Viewer access is enough.
4. Copy the folder's **ID** from its URL
   (`https://drive.google.com/drive/folders/<THIS_PART>`).
5. In `.env`, set either the path to the JSON file **or** the inline credentials,
   plus the folder ID:
   ```
   GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/service-account.json
   GOOGLE_DRIVE_FOLDER_ID=your_folder_id
   # (or, inline instead of the file:)
   # GOOGLE_CLIENT_EMAIL=...@...iam.gserviceaccount.com
   # GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

### AI extraction (Claude)

Extraction uses the Anthropic API. Add a key from
[console.anthropic.com](https://console.anthropic.com):
```
ANTHROPIC_API_KEY=sk-ant-...
EXTRACT_MODEL=claude-opus-4-8
```
Without a key, synced files still import — you just fill in their dates manually.

> Claude reads each Hijri expiry date **as printed**; the Hijri→Gregorian
> conversion is done in code (Umm al-Qura) for accuracy, not by the model.

### Dropbox setup (alternative)

Create a [scoped app](https://www.dropbox.com/developers/apps) with
`files.metadata.read` + `files.content.read`, generate a refresh token
(`token_access_type=offline`), and set `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`,
`DROPBOX_REFRESH_TOKEN`, and `DROPBOX_FOLDER` in `.env`.

## How the reminders work

- Every day at `REMINDER_CRON_HOUR:REMINDER_CRON_MINUTE` (default 09:00 server
  time) the app checks every document.
- When a document is within `REMINDER_LEAD_DAYS` of expiry (default **183 ≈ 6
  months**, also covers already-expired docs), it sends one **digest email**
  listing everything that's due.
- It then won't remind you about that document again for `REMINDER_INTERVAL_DAYS`
  (default **30 ≈ monthly**), and keeps doing so until you renew it.
- **Renewing**: edit the document and upload the new file and/or change the
  expiry date — this resets the reminder cycle automatically.

You can change the 6-month and monthly values any time in **Settings**.

### Running reminders manually

```bash
npm run remind            # send any due reminders now
node src/run-reminders.js --preview   # show what WOULD be sent, send nothing
```

If you'd rather use the system cron instead of the built-in scheduler, point it
at `npm run remind`.

## Keeping it running (self-host)

Use a process manager so it restarts on reboot/crash, e.g. with [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start src/server.js --name doc-tracker
pm2 save && pm2 startup
```

## Data & files

- The database is a single SQLite file at `data/tracker.db`.
- Uploaded document scans live in `uploads/`.
- Both folders are git-ignored. **Back them up** — that's all your data.

## Tech

Node.js + Express · SQLite (better-sqlite3) · node-cron · Resend ·
Google Drive / Dropbox sync · Claude (Anthropic) vision extraction · vanilla JS frontend.
