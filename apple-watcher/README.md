# Apple Watcher

Checks a set of Apple.com product pages once a day, and emails you a
summary of anything added, removed, or changed since the day before.
Completely separate from the Apple Sunset website itself, it doesn't
touch the site's build or its database.

## How it works

- `pages.json` lists which Apple pages to check (one per product line).
- Each day, `check-apple.js` fetches every page, reads off the current
  lineup, and compares it against `snapshot.json` (what it saw last time).
- It emails a summary, then saves the new snapshot for tomorrow's comparison.
- On quiet days it still emails a short "no changes" confirmation, so you
  know it's running.
- The very first run has nothing to compare against, so it just saves a
  baseline and tells you that, rather than reporting every product as "added."

## One-time setup

1. **Get a free Resend account** (this is what actually sends the email):
   go to [resend.com](https://resend.com), sign up, and create an API key.
   The free tier's default sending address (`onboarding@resend.dev`) is
   already wired into the script, no domain setup needed for a personal
   notification email like this.

2. **Add two secrets to this GitHub repo:**
   Repo → Settings → Secrets and variables → Actions → New repository secret
   - `RESEND_API_KEY` — the API key from step 1
   - `NOTIFY_EMAIL` — jgprice@mac.com

3. **That's it.** The workflow in `.github/workflows/apple-watcher.yml`
   runs automatically every day at 08:00 UTC.

## Testing it without waiting for the schedule

Go to the repo's **Actions** tab → **Apple Watcher** → **Run workflow**.
This fires it immediately so you can check the email arrives and the
summary looks right.

## Changing things later

- **Change the email address:** update the `NOTIFY_EMAIL` secret.
- **Change the time it runs:** edit the `cron` line in
  `.github/workflows/apple-watcher.yml` (times are UTC).
- **Add or remove which product lines get checked:** edit `pages.json`.
  Each entry just needs a `category` label and the Apple overview page URL
  that lists every current model in that line (e.g. `apple.com/shop/buy-mac`).

## A few honest caveats

- The three URLs for **Apple TV & HomePod**, **Vision Pro**, and
  **Accessories** in `pages.json` are my best guess at Apple's naming
  pattern, not independently confirmed the way iPhone, Mac, Watch, and
  AirPods were. If the first run reports "no products found" for one of
  those, that page's URL likely needs correcting, just visit apple.com,
  find the right overview page for that category, and swap in its URL.
- Apple can restyle its pages at any time, which could break the parsing.
  The script is written to fail safely if that happens (it'll report
  "couldn't check" for that category rather than falsely claiming
  everything in it was removed), but it's worth glancing at the first
  few days' emails to confirm everything's reading correctly.
