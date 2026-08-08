# Anwaar Hussain Advocate — Hearing Diary (Multi-User)

A web app for tracking court hearings, with each user having their own
account and their own private list of cases. SMS reminders are sent
directly from the user's own phone (via their Messages app) — no SMS
gateway or extra cost needed.

## What's included
- **Backend:** Node.js + Express + SQLite (`data/diary.db`)
- **Auth:** proper multi-user accounts — registration + login, passwords
  hashed with bcrypt, session tokens (not a single shared password anymore)
- **Data isolation:** each user only ever sees their own hearings
- **Frontend:** plain HTML/JS, served by the same server, no build step
- **SMS:** opens the phone's native Messages app, pre-filled, one client
  at a time (tap "Next" to move to the next client) — this is the most
  reliable method across both iPhone and Android

## 1. Run it locally

```bash
npm install
cp .env.example .env
npm start
```

Open http://localhost:3000 — you'll see a "Create account" / "Sign in" screen.
Create your first account there.

## 2. Deploy so it's a real, always-on website

**Render.com** (free tier available, simplest option):

1. Push this folder to a GitHub repository (private is fine)
2. Go to https://render.com → New → Web Service → connect your GitHub repo
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Click **Deploy**. You'll get a URL like `https://your-app.onrender.com`
5. **Important — persistent storage:** Render's free tier wipes the
   filesystem on every redeploy/restart, which would delete the SQLite
   database (all users and hearings). For a real multi-user system this
   matters a lot more than before, so add Render's **Persistent Disk**
   (a few dollars/month) mounted at the app's `data/` folder — this is
   the difference between "data survives" and "data disappears on the
   next deploy."

Alternatives: **Railway.app** or **Fly.io** work almost identically.

## 3. How multi-user works here

- Anyone with the app's URL can create their own account (name, email,
  password)
- Each account's hearings are private to that account — one lawyer/staff
  member cannot see another's cases
- If you want to *restrict* who can register (e.g. only your own staff),
  the simplest approach is to not publicize the URL, or add an invite-code
  check to the registration endpoint — ask if you'd like this added

## 4. Using it day to day

- Sign in (or create an account the first time)
- Add hearings with "New hearing"; edit or delete from each card
- Each card has a **Call** button (opens your phone's dialer) and each
  day's group has a **"Send message to all"** button, which opens your
  Messages app once per client (tap "Next" between each) with a fixed
  Urdu reminder message pre-filled
- The stats bar shows total cases, this month's hearings, and pending
  cases at a glance
- Use the search box to find any client instantly by name or phone number
