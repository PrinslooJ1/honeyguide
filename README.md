# Honeyguide: Beekeeping SA

*Beekeeping, guided.* An offline-first hive log built for South African beekeepers. This is the **beta** of the Honeyguide plan: phases 1 to 5 and the post-launch releases 1.1 to 1.4.

## What works now

- **Onboarding**: name, home province, experience, beekeeper registration number.
- **Apiaries**: name, province, an optional location pin (approximate, about 1 km, or exact), forage and access notes. Landowner details live in the private landowner log (release 1.4).
- **Hives**: type, Cape or African bee, queen year with the international marking colour, status, notes, and a short code (`HG-XXXX`) ready for Phase 2 QR labels. A warning appears if Cape bees are kept in an African-bee province.
- **Guided inspection**: 7 steps sized for gloved hands, each answered with a tap.
  - The steps are colony, queen, brood, stores and space, pests and disease, actions and photos, and review.
  - The review shows a health score from 0 to 100.
  - "Same as last time" fills in the previous answers.
  - A draft is kept if you leave mid-way.
  - Weather comes from the apiary's approximate location.
  - Ticking suspected American foulbrood shows a red banner with the isolate-and-report steps.
- **Photos**: take one with the camera or pick from the gallery, and tag it. Each photo is re-encoded on the phone to a maximum of 1600 px as JPEG, which removes EXIF data, including any GPS tag.
- **Home dashboard**:
  - counts of apiaries, live hives and inspections this month
  - **Needs attention**: AFB, queenless, swarm risk, no stores, overdue
  - recent inspections and a seasonal focus
  - a sting emergency card (10177 / 112)
- **Modes**: Auto, Light, Dark, **Sun** (maximum contrast) and **Night** (red on black).
- **Privacy**:
  - app lock with a 4-digit PIN (PBKDF2-hashed, stays on the device)
  - location settings: Off, Approximate or Precise; there is no background location
  - export everything as JSON, wipe the phone, and delete the account
- **Offline**: a service worker precaches the app, and IndexedDB holds every record. Changes sync when signal returns.
- **Optional cloud backup** (Supabase): email and password, or a magic link. Each user can only reach their own rows (row-level security) and their own photo folder.

## Phase 2 (in progress)

- **QR hive labels and print studio**:
  - stock presets: A4 21-up (63.5 × 38.1 mm), A4 24-up (70 × 37 mm), A4 8-up (99.1 × 67.7 mm), and label printer rolls of 50 × 30 mm and 100 × 50 mm
  - choose which fields show: name, apiary, code, registration number, queen colour, "Scan to log"
  - damage tolerance, which sets QR error correction M, Q or H
  - copies per hive, and skipping used labels on a part sheet
  - a size warning for codes under 20 mm
  - The encoder is in `src/qr.ts`, with no library. It was verified with OpenCV across all ECC levels and up to 1,200 characters, and from printed PDFs.
- **Scanner**: uses the phone's built-in barcode detector (Chrome on Android), with a torch toggle and a typed-code fallback. A label links to `#/h/HG-XXXX`, which opens the hive; from the Inspect tab it opens an inspection.
- **Apiary Groups** (`supabase/migrations/002_apiary_groups.sql`):
  - sharing with roles owner, partner, helper and viewer
  - Cover mode (access that expires)
  - invite codes
  - exact GPS kept in its own table, so members see only the roughly 1 km point unless the owner allows the exact one
  - owner_id can't be changed
  - The rules were tested on a local Postgres. The sharing screens arrived in release 1.4.

## Phase 3: forage and colony growth

- **Region suggestions on the phone** (`src/region.ts`): province (nearest of about 90 reference towns), rainfall zone and bee zone (Cape, hybrid, African). Shown as *Suggested*, with a button to use it. No coordinates leave the phone.
- **Forage library** (`src/content/forage.ts`): 14 plant cards with flowering windows reported by beekeepers (SANBI survey), the province windows for saligna gum, how bees use each flower, flags for bird-pollinated and invasive plants, and sources.
- **Apiary forage**: tag the plants near an apiary to get a 12-month calendar and an 8-week outlook (flow, steady, dearth or pollen gap).
- **Bloom Watch**: log "in bloom near me" against an apiary, never against a GPS point. The regional map (`regional_blooms`, migration 003) shows only anonymous counts, with at least 3 sightings.
- **Colony engine** (`src/engine.ts`): strength score, health trend, growth stage, risk flags (capensis, AFB, beetle, chalkbrood, disturbance, low stores before a dearth, absconded) and one next-best action. All rules are drafts awaiting expert review.
- **Safety centre**: 10177, 112 and 10111, a "read out my position" button (not saved), pre-inspection and hive-moving checklists, fire and hygiene guidance. It gives no chemical doses.

## Phase 4: Academy and game layer

- **Honeyguide Academy** (`src/content/lessons.ts`): 12 lessons, each with a 3-question quiz, an in-app task and sources. Registration facts are checked against GN R.858: registration lasts 24 months, and every hive is marked with the registration number.
- **Ranks**: Fledgling, Forager, Builder, Keeper, Honeyguide. XP counts at most one inspection per hive per week, with a bonus for calm weather. There are no streaks: a weekly logbook rhythm shows 8 dots.
- **Quests**: First Steps, Registration Hero, plus a seasonal quest (Spring Build-up, Summer Flow, Autumn Stores Check, Aloe Season).
- **Labs**: Waggle Dance Lab (drag the flowers and move the sun; about 1 s of waggling per km), Flower Match, and Hive Doctor (6 cases).

## Phase 5: Google Play readiness

- `public/privacy.html`: a POPIA-aware privacy policy matching what the app does (hosted in Frankfurt; Open-Meteo gets only a point rounded to about 1 km; no ads or trackers).
- `public/delete-account.html`: a working web page that deletes the account and its cloud data, which Play requires alongside the in-app option.
- `android/twa-manifest.json`: the settings for PWABuilder or Bubblewrap (`com.prinsloo.honeyguide`, location delegation on). `android/assetlinks.template.json` is the template for the site-and-app link.
- `store/listing.md`: title, descriptions, data safety answers, content rating, target audience and the tester invite.
- `store/feature-graphic.png` (1024 × 500) and `public/store/screen-1..6.png` (1080 × 1920).
- `docs/PLAY_RELEASE.md`: the release checklist, step by step.
- Google Fonts is removed: the app makes no third-party requests except the optional weather.

## Release 1.1: field records

- **Swarm traps**: bait boxes with a private pin or note, lure, check interval, "due a check" on Home, and a catch log. "Moved into a hive" creates the new hive, with the trap and lure recorded.
- **Colony autopsy**: when a hive is marked dead or absconded, record the likely cause from the national loss-survey list, plus theft, fire and drought.
- **Weight and lift log**: weekly kg from a scale, or a light/medium/heavy lift test. The trend reads gaining (flow) or losing (dearth or robbing). Migration 004.

## Release 1.2: moves and contracts

- **Migration planner** (`src/screens/Moves.tsx`):
  - plan a move between apiaries, choosing the hives, date, distance and costs
  - checks before the move: Cape bees heading into African-bee country, unknown bee types leaving the Cape or hybrid zone, suspected AFB (do not move), recent small hive beetle, and missing landowner permission
  - a night-move checklist, one tap into Night mode, and cost per hive
  - "Hives are moved" updates every hive's apiary; completed moves form the movement record
- **Pollination contracts** (`src/screens/Contracts.tsx`):
  - grower, farm, contact, crop, hives, fee per hive, in and out dates, placement apiary and spray agreement
  - status steps: draft › agreed › placed › completed › invoiced › paid
  - a printable invoice (INV-YYYY-NNN) with your invoice details from Profile

## Release 1.3: honey, callouts and incidents

- **Harvest log**: kg, frames, main forage (from the apiary's tagged plants) and moisture. It warns above 20% water, the Codex limit.
- **Jar batches** (`src/screens/Honey.tsx`): group harvests and pick a jar size to estimate jar count. Passport stickers print on any label stock, with a QR code to the batch's passport.
- **Public honey passport** (`public/passport.html` with the `get_passport(code)` function from migration 005): batch name, forage, province, harvest month and size. It shows the registration number or a contact only if the owner chooses, and is opt-in per batch. It never shows a location.
- **Bee-removal job book** (`src/screens/Jobs.tsx`): client, phone, area, before and after photos, outcome and fee, with an invoice. "Relocated to my apiary" turns the colony into a new hive.
- **Theft and incident pack** (`src/screens/Incidents.tsx`): log what happened, which hives, photos and the SAPS case number. The printable report pack lists your registration number, the hive codes on the boxes, last-inspection dates and photos. The apiary GPS is included only if you choose.
- **Business hub**: paid this year, still owed, and links to all of the above. Business records are owner-only, even in shared apiaries (migration 005).

## Release 1.4: sharing, mentors, landowners, equipment, survey, Vault

- **Sharing** (`src/share.ts`, `src/screens/Share.tsx`, More › Sharing):
  - create a group, tick the apiaries to share, and invite by QR code, WhatsApp link or a 6-character code
  - roles partner, helper and viewer; cover mode ends access by itself; the owner can change roles, allow exact locations for partners, end access or remove members
  - screens follow the role: viewers see and comment, helpers also inspect, partners also edit; only owners delete (enforced in the database too)
  - recent activity ("Pieter inspected Hive 2"), and a Home card for new comments
  - the shared apiary row carries only a point rounded to about 1 km; the exact pin goes to `apiary_locations`
  - when access ends, or on sign-out, shared records leave the phone; changes the server refuses stay on the phone, flagged, to retry or discard
- **Mentor mode**: "Ask a mentor" on a hive makes a one-hive, view-only link for 3 days to a month. The mentor sees that hive's inspections, photos and comments, and can comment. Not the apiary, its location or other hives.
- **Landowner log** (`src/screens/Landowners.tsx`): landowner, phone, kind of permission, dates and terms, a reminder before it runs out (Home card), and a site log of complaints, visits and honey given. Private to the owner.
- **Equipment and cleaning log** (`src/screens/Equipment.tsx`): what you have and where, cleaning history, and quarantine for boxes from a dead-out ("Log the empty boxes" on a lost hive). Kit from a colony with suspected foulbrood stays in quarantine until official advice.
- **Loss survey** (`src/screens/Survey.tsx`): an opt-in, anonymous end-of-season survey, pre-filled from your records and sent through `submit_loss_survey()` with the public key only, so it is not linked to the account.
- **Season replay** (`src/screens/Replay.tsx`): a year-in-review card drawn on the phone, shared as a picture or as WhatsApp text.
- **Vault** (`src/vault.ts`, More › Vault): optional end-to-end encryption. A random AES-GCM key encrypts exact pins, landowner details, contract and callout details and fees, move costs and invoice details before upload; the server keeps placeholders and an `enc` column. The key is stored only wrapped by a PBKDF2 key from the passphrase (600,000 iterations), so another phone can unlock with the passphrase. A forgotten passphrase cannot be recovered. Not yet: sharing the Vault key with group members, so partners see the rounded point while the Vault is on.
- Migrations 006 (helpers moved to a private schema), 007 (hive shares, comments, landowner log, equipment, survey) and 008 (Vault columns).

## Tests

- `tests/db/run.sh`: a throwaway local Postgres 16 with every migration and the row-level security checks for sharing, mentors, deletes, the survey and inserts that return rows.
- `tests/e2e/run.sh`: a local stand-in for Supabase (`tests/mock/server.mjs`: auth, a PostgREST subset and storage over the real migrations and policies) and Playwright tests with three phones (`sharing.cjs`) and two phones (`vault.cjs`).

## Run it

```bash
npm install
npm run build      # outputs dist/
npm run dev        # http://localhost:5173 (no service worker on localhost)
```

Build-time overrides: `SUPABASE_URL` and `SUPABASE_KEY` (publishable key). The defaults point at the `honeyguide` Supabase project.

## Database

Apply `supabase/migrations/001_init.sql` to `008_vault.sql` in order. 001 creates:
- the tables, with triggers that stamp `updated_at` on the server
- the row-level security policies
- the private `photos` bucket
- `delete_my_account()`

Apply it once: open Supabase Dashboard › SQL Editor, paste the file and click Run.

**Auth settings** (Dashboard › Authentication › URL Configuration): set **Site URL** to the Vercel address and add it under **Redirect URLs**. Confirmation and magic-link emails need this to return to the app.

## Stack and why

This prototype uses React 19 bundled with esbuild, a small IndexedDB layer (`src/db.ts`), and Supabase called over plain `fetch` (`src/sync.ts`), with no SDK. Fewer dependencies mean a small, fast app on low-end Android phones. Moving to Vite, Dexie and supabase-js later is straightforward because the data model already matches.

## Next (from the plan)

- Deploy on Vercel, set the Supabase Auth URLs, and build the Android package with PWABuilder (Trusted Web Activity, Digital Asset Links).
- Google Play: store listing, data safety form, and the 14-day closed test with 12 or more testers.
- Later: sharing the Vault key with chosen members, Afrikaans, realtime updates for shared apiaries.

Guidance in the app is general information, not veterinary or legal advice.
