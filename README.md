# Barber Shop POS

A point of sale, cash register, daily closing, barber commission and P&L app
for a small barber shop, built to install like a real app on a phone or
tablet, with no app store account needed.

## What this is, in plain terms

This is a normal website that is built to behave like an app once you add it
to your home screen: it opens full screen with no browser bar, gets its own
icon, and keeps working without internet after the first load. That pattern
is called a PWA (Progressive Web App). iPhone and Android both support it
natively, no extra software needed on the phone.

By default, data is stored on the device itself and does not sync between
phones. Follow "Step 0: Turn on live shared data" below before deploying if
you want both partners' phones and the shop tablet to show the same running
register live. If you skip Step 0, the app still works fully, just with each
device keeping its own separate data.

## Step 0: Turn on live shared data (recommended, takes about 5 minutes)

This makes every phone and the shop tablet read and write the same live
register, using a free Supabase database as the shared backend.

1. Go to supabase.com, sign up free, and create a new project (pick any
   name and a database password, and remember that password isn't the one
   you'll use day to day, it's just for the database itself).
2. In your new project, open "SQL Editor" in the left sidebar, click "New
   query", paste in the full contents of `supabase-setup.sql` from this
   project, and click "Run". This creates the one table the app needs,
   plus a storage bucket called "receipts" for photo and PDF attachments
   on sales and expenses.
3. Open "Project Settings" (gear icon), then "Data API", and copy the
   "Project URL". Then go to "API Keys" (a separate tab under Settings)
   and copy the key labeled "Publishable key" (starts with
   `sb_publishable_`). Supabase renamed this from "anon public key" in
   late 2025, it's the same thing under a new name. Do not use a "Secret
   key" (`sb_secret_`), those have full database access and should never
   go inside an app.
4. In this project folder, copy `.env.example` to a new file named `.env`,
   and paste in the two values:

       VITE_SUPABASE_URL=https://your-project-ref.supabase.co
       VITE_SUPABASE_ANON_KEY=your-anon-key-here

5. That's it locally. When you deploy in Step 1, add these same two values
   as Environment Variables in Vercel's project settings (Vercel will show
   you exactly where when you import the project), otherwise the deployed
   version won't have them and will fall back to local-only mode.

A "LIVE" badge appears next to the shop name in the app once this is
working, so you can confirm it's connected.

**Worth knowing:** this setup uses a single shared key rather than
individual logins for Supabase itself, which keeps setup simple for a shop
this size but means anyone with your deployed app's address can read and
write shop data, the same way anyone with the shop tablet could before. Keep
the PIN screen as your access control, and don't reuse this Supabase project
for anything more sensitive than shop transactions.

## Step 1: Put this online

You need one free hosting step so the app has a permanent web address. This
takes about five minutes.

1. Create a free account at vercel.com (sign in with GitHub, Google, or
   email).
2. Create a free GitHub account if you don't have one, and create a new empty
   repository, for example `barber-pos-app`.
3. Upload this entire folder to that repository. The easiest way: on the
   repository page, click "Add file" then "Upload files", then drag in every
   file and folder from this project.
4. In Vercel, click "Add New" then "Project", then select the repository you
   just created. Vercel detects it as a Vite project automatically. Leave all
   settings as default and click "Deploy".
5. After about a minute, Vercel gives you a live web address, something like
   barber-pos-app.vercel.app. That is now your app's permanent home.

Netlify works the same way if you prefer it over Vercel.

## Step 2: Install it on your phone

### iPhone
1. Open the web address from Step 1 in Safari (must be Safari, not Chrome,
   for this to work on iPhone).
2. Tap the Share icon (square with an arrow) at the bottom of the screen.
3. Tap "Add to Home Screen".
4. Tap "Add". The app icon now sits on your home screen and opens full
   screen like any other app.

### Android
1. Open the web address from Step 1 in Chrome.
2. Tap the three-dot menu in the top right.
3. Tap "Add to Home screen" or "Install app" (Chrome sometimes offers this
   automatically as a banner at the bottom).
4. Confirm. The app icon now sits on your home screen.

Do this on both partners' phones and on the shop tablet. Each device keeps
its own data until you add shared sync (below).

## Local development

    npm install
    npm run dev

Open the printed local address in your browser to test changes before
deploying.

To produce a production build yourself:

    npm run build
    npm run preview

## Project structure

    src/
      App.jsx        the entire application: login, sales, expenses, cash
                      register, daily closing, barbers, services, reports,
                      partner accounts, settings
      storage.js      the local on-device storage layer (IndexedDB)
      main.jsx        React entry point
    public/
      icons/          app icons used for the home screen and install prompt
    vite.config.js    build config, including the PWA plugin that generates
                      the manifest and offline service worker

## Attachments (receipts, bills, card slips)

Both New Sale and New Expense have an optional "Attach receipt / bill"
field, with a camera button for a quick photo and a file picker for
existing photos or PDFs. Saved attachments show up as a "View photo" or
"View PDF" link under Reports, next to the sale or expense they belong to.

In shared (Supabase) mode, attachments upload to the "receipts" storage
bucket created by `supabase-setup.sql` and are visible from any device. In
local mode, attachments are stored on that device only, in the same
on-device database as everything else, and won't appear on the other
partner's phone.

## How the shared/local switch works

`src/storage.js` checks at startup whether `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are set. If both are present, it reads and writes
to Supabase and listens for live updates (Supabase's realtime feature) so
other devices' changes appear within a couple of seconds. If either is
missing, it silently falls back to the on-device IndexedDB store from
before, so the app never breaks, it just stops sharing.

A natural next step once this is running is replacing the shared PIN login
with individual Supabase-backed accounts and server-enforced role
permissions, rather than permissions that only live in the app code. Ask if
you want that built.

## What's intentionally not built yet

Per the original brief's own rule to not overengineer a shop this size:
inventory tracking, appointments, customer records, PDF and Excel export,
and printer integration are not in this version. The data model has room for
all of them without a rewrite. Ask if you want any of these added next.
